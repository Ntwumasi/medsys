import { Request, Response } from 'express';
import pool from '../database/db';
import path from 'path';
import fs from 'fs';

const UPLOAD_DIR = path.join(__dirname, '../../uploads');

// Ensure upload directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Get documents for a patient
export const getPatientDocuments = async (req: Request, res: Response): Promise<void> => {
  try {
    const { patient_id } = req.params;
    const { document_type, encounter_id } = req.query;

    let query = `
      SELECT
        pd.*,
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

    // Decode base64 and save file
    const base64Data = file_data.replace(/^data:[^;]+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');

    // Generate unique filename
    const timestamp = Date.now();
    const safeFileName = document_name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const fileName = `${timestamp}_${safeFileName}`;
    const filePath = path.join(UPLOAD_DIR, fileName);

    // Write file
    fs.writeFileSync(filePath, buffer);
    const fileSize = buffer.length;

    // Save to database
    const result = await pool.query(
      `INSERT INTO patient_documents
       (patient_id, encounter_id, lab_order_id, document_type, document_name, file_path, file_type, file_size, description, uploaded_by, is_confidential)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
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
        is_confidential || false
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

// Download/view a document
export const getDocument = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `SELECT * FROM patient_documents WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }

    const document = result.rows[0];
    const filePath = path.join(UPLOAD_DIR, document.file_path);

    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: 'File not found on server' });
      return;
    }

    // Read file and send as base64
    const fileBuffer = fs.readFileSync(filePath);
    const base64Data = fileBuffer.toString('base64');

    res.json({
      document: {
        ...document,
        file_data: `data:${document.file_type};base64,${base64Data}`
      }
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
      `SELECT * FROM patient_documents WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }

    const document = result.rows[0];
    const filePath = path.join(UPLOAD_DIR, document.file_path);

    // Delete from database first
    await pool.query(`DELETE FROM patient_documents WHERE id = $1`, [id]);

    // Then delete file if exists
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    res.json({ message: 'Document deleted successfully' });
  } catch (error) {
    console.error('Error deleting document:', error);
    res.status(500).json({ error: 'Failed to delete document' });
  }
};
