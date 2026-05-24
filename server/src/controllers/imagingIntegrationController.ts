import { Request, Response } from 'express';
import pool from '../database/db';
import { notificationService } from '../services/notificationService';

const accessionFor = (orderId: number | string): string => {
  return `MED${String(orderId).padStart(8, '0')}`;
};

const orderIdFromAccession = (accession: string): number | null => {
  const match = accession.match(/^MED(\d+)$/);
  if (!match) return null;
  return parseInt(match[1], 10);
};

const aetForModality = (imagingType: string): string => {
  const map: Record<string, string> = {
    'Ultrasound': 'REDWOOD_US',
    'X-Ray': 'LUMINOS_DRF',
    'Fluoroscopy': 'LUMINOS_DRF',
  };
  return map[imagingType] || 'ANY_MODALITY';
};

const modalityCode = (imagingType: string): string => {
  const map: Record<string, string> = {
    'Ultrasound': 'US',
    'X-Ray': 'DX',
    'Fluoroscopy': 'RF',
    'CT Scan': 'CT',
    'MRI': 'MR',
    'Mammogram': 'MG',
  };
  return map[imagingType] || 'OT';
};

/**
 * GET /api/imaging/integration/pending-worklist
 *
 * Bridge polls this every ~30s. Returns imaging orders that need a .wl file
 * generated and dropped into C:\OrthancWorklists. Each order comes back with
 * everything the bridge needs to build a DICOM MWL entry.
 */
export const getPendingWorklist = async (_req: Request, res: Response): Promise<void> => {
  try {
    const result = await pool.query(`
      SELECT
        io.id,
        io.imaging_type,
        io.body_part,
        io.priority,
        io.clinical_indication,
        io.ordered_date,
        io.patient_id,
        p.patient_number,
        p.date_of_birth,
        p.gender,
        pu.first_name AS patient_first_name,
        pu.last_name AS patient_last_name,
        ou.first_name || ' ' || ou.last_name AS referring_physician
      FROM imaging_orders io
      LEFT JOIN patients p ON io.patient_id = p.id
      LEFT JOIN users pu ON p.user_id = pu.id
      LEFT JOIN users ou ON io.ordering_provider = ou.id
      WHERE io.status IN ('ordered', 'pending', 'scheduled')
        AND COALESCE(io.modality_worklist_pushed, FALSE) = FALSE
      ORDER BY
        CASE WHEN io.priority = 'stat' THEN 0
             WHEN io.priority = 'urgent' THEN 1
             ELSE 2 END,
        io.ordered_date ASC
      LIMIT 200
    `);

    const orders = result.rows.map((row) => ({
      order_id: row.id,
      accession_number: accessionFor(row.id),
      scheduled_procedure_step_id: `SPS${row.id}`,
      scheduled_station_ae_title: aetForModality(row.imaging_type),
      modality: modalityCode(row.imaging_type),
      study_description: `${row.imaging_type} - ${row.body_part || 'unspecified'}`,
      requested_procedure_description: row.clinical_indication || row.body_part || row.imaging_type,
      priority: row.priority,
      scheduled_datetime: row.ordered_date,
      patient: {
        id: row.patient_id,
        patient_number: row.patient_number,
        first_name: row.patient_first_name,
        last_name: row.patient_last_name,
        date_of_birth: row.date_of_birth,
        sex: row.gender === 'female' ? 'F' : row.gender === 'male' ? 'M' : 'O',
      },
      referring_physician: row.referring_physician,
    }));

    res.json({ orders });
  } catch (error) {
    console.error('Get pending worklist error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * POST /api/imaging/integration/orders/:id/worklist-pushed
 *
 * Bridge calls this after successfully writing the .wl file. We flip the
 * flag so the order doesn't get re-pushed on the next poll.
 */
export const markWorklistPushed = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id as string, 10);
    if (Number.isNaN(id)) {
      res.status(400).json({ error: 'Invalid order id' });
      return;
    }

    const result = await pool.query(
      `UPDATE imaging_orders
         SET modality_worklist_pushed = TRUE,
             accession_number = COALESCE(accession_number, $2),
             updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING id, accession_number`,
      [id, accessionFor(id)]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Order not found' });
      return;
    }

    res.json({ ok: true, order: result.rows[0] });
  } catch (error) {
    console.error('Mark worklist pushed error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * POST /api/webhooks/orthanc/study
 *
 * Bridge calls this when Orthanc receives a new study. Body should include
 * the DICOM identifiers + accession number so we can link to the order.
 */
export const orthancStudyWebhook = async (req: Request, res: Response): Promise<void> => {
  const {
    study_instance_uid,
    accession_number,
    orthanc_id,
    study_date,
    study_description,
    modality,
    institution_name,
    referring_physician,
    series_count,
    instances_count,
    series, // optional: [{ series_instance_uid, series_number, description, modality, body_part, instances_count, orthanc_id }]
  } = req.body || {};

  if (!study_instance_uid) {
    res.status(400).json({ error: 'study_instance_uid is required' });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    let orderId: number | null = null;
    let patientId: number | null = null;
    let encounterId: number | null = null;

    if (accession_number) {
      const parsed = orderIdFromAccession(accession_number);
      if (parsed) {
        const orderRes = await client.query(
          `SELECT id, patient_id, encounter_id, ordering_provider
             FROM imaging_orders WHERE id = $1`,
          [parsed]
        );
        if (orderRes.rows.length > 0) {
          orderId = orderRes.rows[0].id;
          patientId = orderRes.rows[0].patient_id;
          encounterId = orderRes.rows[0].encounter_id;
        }
      }
    }

    const existing = await client.query(
      `SELECT id FROM imaging_studies WHERE study_instance_uid = $1`,
      [study_instance_uid]
    );

    let studyId: number;
    if (existing.rows.length > 0) {
      studyId = existing.rows[0].id;
      await client.query(
        `UPDATE imaging_studies
            SET accession_number = COALESCE($2, accession_number),
                patient_id = COALESCE($3, patient_id),
                imaging_order_id = COALESCE($4, imaging_order_id),
                encounter_id = COALESCE($5, encounter_id),
                study_date = COALESCE($6, study_date),
                study_description = COALESCE($7, study_description),
                modality = COALESCE($8, modality),
                institution_name = COALESCE($9, institution_name),
                referring_physician = COALESCE($10, referring_physician),
                orthanc_id = COALESCE($11, orthanc_id),
                series_count = COALESCE($12, series_count),
                instances_count = COALESCE($13, instances_count),
                updated_at = CURRENT_TIMESTAMP
          WHERE id = $1`,
        [
          studyId, accession_number, patientId, orderId, encounterId,
          study_date, study_description, modality, institution_name,
          referring_physician, orthanc_id, series_count, instances_count,
        ]
      );
    } else {
      const insert = await client.query(
        `INSERT INTO imaging_studies (
           study_instance_uid, accession_number, patient_id, imaging_order_id, encounter_id,
           study_date, study_description, modality, institution_name, referring_physician,
           orthanc_id, series_count, instances_count
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         RETURNING id`,
        [
          study_instance_uid, accession_number, patientId, orderId, encounterId,
          study_date, study_description, modality, institution_name,
          referring_physician, orthanc_id, series_count, instances_count,
        ]
      );
      studyId = insert.rows[0].id;
    }

    if (Array.isArray(series)) {
      for (const s of series) {
        if (!s?.series_instance_uid) continue;
        await client.query(
          `INSERT INTO imaging_series (
             study_id, series_instance_uid, series_number, series_description,
             modality, body_part_examined, instances_count, orthanc_id
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
           ON CONFLICT (series_instance_uid) DO UPDATE SET
             study_id = EXCLUDED.study_id,
             series_number = EXCLUDED.series_number,
             series_description = EXCLUDED.series_description,
             modality = EXCLUDED.modality,
             body_part_examined = EXCLUDED.body_part_examined,
             instances_count = EXCLUDED.instances_count,
             orthanc_id = EXCLUDED.orthanc_id`,
          [
            studyId,
            s.series_instance_uid,
            s.series_number ?? null,
            s.description ?? null,
            s.modality ?? null,
            s.body_part ?? null,
            s.instances_count ?? 0,
            s.orthanc_id ?? null,
          ]
        );
      }
    }

    let notifyUserId: number | null = null;
    if (orderId) {
      const updated = await client.query(
        `UPDATE imaging_orders
            SET status = 'completed',
                study_instance_uid = COALESCE(study_instance_uid, $2),
                accession_number = COALESCE(accession_number, $3),
                updated_at = CURRENT_TIMESTAMP
          WHERE id = $1
          RETURNING ordering_provider, encounter_id`,
        [orderId, study_instance_uid, accession_number || accessionFor(orderId)]
      );
      if (updated.rows.length > 0) {
        notifyUserId = updated.rows[0].ordering_provider;
      }
    }

    await client.query('COMMIT');

    if (notifyUserId) {
      try {
        await notificationService.send({
          userId: notifyUserId,
          type: 'imaging_complete',
          title: 'Imaging study received',
          message: `${study_description || modality || 'Study'} is ready to view`,
          entityType: 'imaging_study',
          entityId: studyId,
        });
      } catch (notifyErr) {
        console.error('Failed to notify ordering provider:', notifyErr);
      }
    }

    res.json({ ok: true, study_id: studyId, linked_order_id: orderId });
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch {}
    console.error('Orthanc study webhook error:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
};

/**
 * GET /api/imaging/studies/by-order/:order_id
 *
 * Used by the frontend to render "View Study" links next to an imaging order.
 */
export const getStudiesByOrder = async (req: Request, res: Response): Promise<void> => {
  try {
    const orderId = parseInt(req.params.order_id as string, 10);
    if (Number.isNaN(orderId)) {
      res.status(400).json({ error: 'Invalid order id' });
      return;
    }

    const result = await pool.query(
      `SELECT id, study_instance_uid, accession_number, study_date,
              study_description, modality, series_count, instances_count, status
         FROM imaging_studies
         WHERE imaging_order_id = $1
         ORDER BY study_date DESC NULLS LAST, id DESC`,
      [orderId]
    );

    res.json({ studies: result.rows });
  } catch (error) {
    console.error('Get studies by order error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * GET /api/imaging/studies/:id/viewer-url
 *
 * Returns a Stone Web Viewer deep-link. The browser reaches Orthanc directly
 * over the Tailscale tailnet (so the user must have Tailscale running). Bridge
 * does not proxy DICOM pixel data — that would saturate the cloud uplink.
 */
export const getViewerUrl = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id as string, 10);
    if (Number.isNaN(id)) {
      res.status(400).json({ error: 'Invalid study id' });
      return;
    }

    const result = await pool.query(
      `SELECT study_instance_uid FROM imaging_studies WHERE id = $1`,
      [id]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Study not found' });
      return;
    }

    const base = process.env.ORTHANC_VIEWER_BASE_URL;
    if (!base) {
      res.status(503).json({
        error: 'Viewer not configured',
        detail: 'ORTHANC_VIEWER_BASE_URL is not set on the server',
      });
      return;
    }

    const studyUid = result.rows[0].study_instance_uid;
    const url = `${base.replace(/\/$/, '')}/stone-webviewer/index.html?study=${encodeURIComponent(studyUid)}`;
    res.json({ url });
  } catch (error) {
    console.error('Get viewer url error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
