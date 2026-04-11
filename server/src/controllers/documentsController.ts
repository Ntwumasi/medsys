import { Request, Response } from 'express';
import pool from '../database/db';
import path from 'path';

// Files are stored as BYTEA in patient_documents.file_blob.
// The previous filesystem approach (/tmp/uploads) does not persist on
// Vercel serverless — files vanish between function invocations — so
// the canonical storage is now the database.

// Security: File upload configuration
const MAX_FILE_SIZE_MB = 10;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

// Allowed MIME types for medical documents
const ALLOWED_MIME_TYPES: Record<string, string[]> = {
  'application/pdf': ['.pdf'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/gif': ['.gif'],
  'image/webp': ['.webp'],
  'application/dicom': ['.dcm', '.dicom'],
  'text/plain': ['.txt'],
  'application/msword': ['.doc'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
};

// Security: Validate file type and extension match
const validateFileType = (mimeType: string, fileName: string): { valid: boolean; error?: string } => {
  const allowedExtensions = ALLOWED_MIME_TYPES[mimeType];
  if (!allowedExtensions) {
    return { valid: false, error: `File type '${mimeType}' is not allowed. Allowed types: PDF, images (JPEG, PNG, GIF), DICOM, text documents.` };
  }

  const ext = path.extname(fileName).toLowerCase();
  if (!allowedExtensions.includes(ext)) {
    return { valid: false, error: `File extension '${ext}' does not match the declared type '${mimeType}'.` };
  }

  return { valid: true };
};

// Get documents for a patient (metadata only — never returns file_blob)
export const getPatientDocuments = async (req: Request, res: Response): Promise<void> => {
  try {
    const { patient_id } = req.params;
    const { document_type, encounter_id } = req.query;

    let query = `
      SELECT
        pd.id, pd.patient_id, pd.encounter_id, pd.lab_order_id,
        pd.document_type, pd.document_name, pd.file_type, pd.file_size,
        pd.description, pd.uploaded_by, pd.is_confidential,
        pd.created_at, pd.updated_at,
        u.first_name || ' ' || u.last_name as uploaded_by_name,
        lo.test_name as lab_test_name
      FROM patient_documents pd
      LEFT JOIN users u ON pd.uploaded_by = u.id
      LEFT JOIN lab_orders lo ON pd.lab_order_id = lo.id
      WHERE pd.patient_id = $1
    `;
    const params: any[] = [patient_id];
    let paramIndex = 2;

    if (document_type) {
      query += ` AND pd.document_type = $${paramIndex}`;
      params.push(document_type);
      paramIndex++;
    }

    if (encounter_id) {
      query += ` AND pd.encounter_id = $${paramIndex}`;
      params.push(encounter_id);
      paramIndex++;
    }

    query += ` ORDER BY pd.created_at DESC`;

    const result = await pool.query(query, params);

    res.json({ documents: result.rows });
  } catch (error) {
    console.error('Error fetching patient documents:', error);
    res.status(500).json({ error: 'Failed to fetch documents' });
  }
};

// Upload a document (base64 encoded)
export const uploadDocument = async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      patient_id,
      encounter_id,
      lab_order_id,
      document_type,
      document_name,
      file_data,
      file_type,
      description,
      is_confidential
    } = req.body;

    const userId = (req as any).user?.id;

    if (!patient_id || !file_data || !document_name) {
      res.status(400).json({ error: 'Missing required fields' });
      return;
    }

    // SECURITY: Validate file type
    const mimeType = file_type || 'application/pdf';
    const typeValidation = validateFileType(mimeType, document_name);
    if (!typeValidation.valid) {
      res.status(400).json({ error: typeValidation.error });
      return;
    }

    // Decode base64 and validate size
    const base64Data = file_data.replace(/^data:[^;]+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    const fileSize = buffer.length;

    // SECURITY: Validate file size
    if (fileSize > MAX_FILE_SIZE_BYTES) {
      res.status(400).json({
        error: `File size (${Math.round(fileSize / 1024 / 1024 * 100) / 100}MB) exceeds maximum allowed size (${MAX_FILE_SIZE_MB}MB).`
      });
      return;
    }

    // SECURITY: Validate file size is not suspiciously small (potential empty/malicious file)
    if (fileSize < 100) {
      res.status(400).json({ error: 'File appears to be empty or corrupted.' });
      return;
    }

    // Generate a sanitized filename (kept only as a label for downloads).
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    const ext = path.extname(document_name).toLowerCase();
    const baseName = path
      .basename(document_name, ext)
      .replace(/[^a-zA-Z0-9]/g, '_')
      .substring(0, 50);
    const fileName = `${timestamp}_${randomSuffix}_${baseName}${ext}`;

    // Save metadata + raw bytes to the database.
    const result = await pool.query(
      `INSERT INTO patient_documents
       (patient_id, encounter_id, lab_order_id, document_type, document_name,
        file_path, file_type, file_size, description, uploaded_by,
        is_confidential, file_blob)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING id, patient_id, encounter_id, lab_order_id, document_type,
                 document_name, file_path, file_type, file_size, description,
                 uploaded_by, is_confidential, created_at, updated_at`,
      [
        patient_id,
        encounter_id || null,
        lab_order_id || null,
        document_type || 'lab_result',
        document_name,
        fileName,
        file_type || 'application/pdf',
        fileSize,
        description || null,
        userId,
        is_confidential || false,
        buffer,
      ]
    );

    // If linked to a lab order, update the lab order with document reference
    if (lab_order_id) {
      await pool.query(
        `UPDATE lab_orders SET result_document_id = $1 WHERE id = $2`,
        [result.rows[0].id, lab_order_id]
      );
    }

    res.json({
      message: 'Document uploaded successfully',
      document: result.rows[0]
    });
  } catch (error) {
    console.error('Error uploading document:', error);
    res.status(500).json({ error: 'Failed to upload document' });
  }
};

// Download/view a document. Returns the raw bytes inline as base64 so the
// front end can render the file without a separate streaming endpoint.
export const getDocument = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `SELECT id, patient_id, encounter_id, lab_order_id, document_type,
              document_name, file_path, file_type, file_size, description,
              uploaded_by, is_confidential, created_at, updated_at, file_blob
         FROM patient_documents WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }

    const document = result.rows[0];

    if (!document.file_blob) {
      res.status(404).json({ error: 'File data not available for this document' });
      return;
    }

    const buffer: Buffer = document.file_blob;
    const base64Data = buffer.toString('base64');
    const fileType = document.file_type || 'application/octet-stream';

    // Strip the blob from the metadata payload before sending it back.
    const { file_blob: _ignored, ...metadata } = document;

    res.json({
      document: {
        ...metadata,
        file_data: `data:${fileType};base64,${base64Data}`,
      },
    });
  } catch (error) {
    console.error('Error fetching document:', error);
    res.status(500).json({ error: 'Failed to fetch document' });
  }
};

// Delete a document
export const deleteDocument = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `DELETE FROM patient_documents WHERE id = $1 RETURNING id`,
      [id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }

    res.json({ message: 'Document deleted successfully' });
  } catch (error) {
    console.error('Error deleting document:', error);
    res.status(500).json({ error: 'Failed to delete document' });
  }
};
