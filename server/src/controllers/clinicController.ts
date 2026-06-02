import { Request, Response } from 'express';
import pool from '../database/db';
import { auditService } from '../services/auditService';
import { notificationService } from '../services/notificationService';

// Get all active clinics
export const getAllClinics = async (_req: Request, res: Response): Promise<void> => {
  try {
    const result = await pool.query(
      'SELECT * FROM clinics WHERE is_active = true ORDER BY name'
    );
    res.json({ clinics: result.rows });
  } catch (error) {
    console.error('Get clinics error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get active clinics with their full payer price breakdown (self-pay + each
// insurer + each corporate), for the Clinics pricing showcase.
export const getClinicPricing = async (_req: Request, res: Response): Promise<void> => {
  try {
    const clinicsRes = await pool.query(
      `SELECT c.id, c.name, c.charge_master_id, cm.service_code, cm.price AS self_pay
       FROM clinics c
       LEFT JOIN charge_master cm ON c.charge_master_id = cm.id
       WHERE c.is_active = true
       ORDER BY c.name`
    );

    const chargeIds = clinicsRes.rows.map((r: any) => r.charge_master_id).filter((x: any) => x != null);
    let payerRows: any[] = [];
    if (chargeIds.length > 0) {
      const pr = await pool.query(
        `SELECT pps.charge_master_id, pps.payer_type, pps.price, pps.is_excluded,
                ip.name AS insurer, cc.name AS corporate
         FROM payer_price_schedules pps
         LEFT JOIN insurance_providers ip ON pps.insurance_provider_id = ip.id
         LEFT JOIN corporate_clients cc ON pps.corporate_client_id = cc.id
         WHERE pps.charge_master_id = ANY($1)`,
        [chargeIds]
      );
      payerRows = pr.rows;
    }

    // All active payers — so every payer is editable (and addable) per clinic,
    // not just the ones that already have a special rate.
    const insurersRes = await pool.query("SELECT id, name FROM insurance_providers WHERE is_active = true ORDER BY name");
    const corpsRes = await pool.query("SELECT id, name FROM corporate_clients WHERE is_active = true ORDER BY name");

    const clinics = clinicsRes.rows.map((c: any) => {
      const rows = payerRows.filter((p) => p.charge_master_id === c.charge_master_id);
      const findRow = (kind: 'insurance' | 'corporate', name: string) =>
        rows.find((p) => p.payer_type === kind && (kind === 'insurance' ? p.insurer : p.corporate) === name);
      const insurance = insurersRes.rows.map((ip: any) => {
        const row = findRow('insurance', ip.name);
        return {
          payer_id: ip.id,
          name: ip.name,
          price: row && !row.is_excluded ? Number(row.price) : null,
          excluded: row ? row.is_excluded : false,
          set: !!row,
        };
      });
      const corporate = corpsRes.rows.map((cc: any) => {
        const row = findRow('corporate', cc.name);
        return {
          payer_id: cc.id,
          name: cc.name,
          price: row && !row.is_excluded ? Number(row.price) : null,
          excluded: row ? row.is_excluded : false,
          set: !!row,
        };
      });
      return {
        id: c.id,
        name: c.name,
        charge_master_id: c.charge_master_id,
        self_pay: c.self_pay != null ? Number(c.self_pay) : null,
        insurance,
        corporate,
      };
    });

    res.json({ clinics });
  } catch (error) {
    console.error('Get clinic pricing error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Update all prices for a clinic's consultation (self-pay + per-payer), reflect
// in billing, audit the change, and notify admins of who changed what.
export const updateClinicPricing = async (req: Request, res: Response): Promise<void> => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { self_pay, payers } = req.body as {
      self_pay?: number | string | null;
      payers?: Array<{ payer_type: 'insurance' | 'corporate'; payer_id: number; price?: number | string | null; excluded?: boolean }>;
    };
    const authUser = (req as any).user;

    const clinicRes = await client.query(
      `SELECT c.id, c.name, c.charge_master_id, cm.price AS self_pay
       FROM clinics c LEFT JOIN charge_master cm ON c.charge_master_id = cm.id
       WHERE c.id = $1`,
      [id]
    );
    if (clinicRes.rows.length === 0) {
      res.status(404).json({ error: 'Clinic not found' });
      return;
    }
    const clinic = clinicRes.rows[0];
    if (!clinic.charge_master_id) {
      res.status(400).json({ error: 'This clinic has no consultation charge linked, so prices cannot be set here.' });
      return;
    }
    const chargeId = clinic.charge_master_id;

    // Snapshot current payer prices for the change diff
    const beforeRes = await client.query(
      `SELECT pps.payer_type, pps.price, pps.is_excluded,
              COALESCE(ip.name, cc.name) AS payer_name
       FROM payer_price_schedules pps
       LEFT JOIN insurance_providers ip ON pps.insurance_provider_id = ip.id
       LEFT JOIN corporate_clients cc ON pps.corporate_client_id = cc.id
       WHERE pps.charge_master_id = $1`,
      [chargeId]
    );
    const beforeMap = new Map<string, { price: number | null; excluded: boolean }>();
    beforeMap.set('Self-pay', { price: clinic.self_pay != null ? Number(clinic.self_pay) : null, excluded: false });
    for (const r of beforeRes.rows) {
      beforeMap.set(r.payer_name, { price: r.is_excluded ? null : Number(r.price), excluded: r.is_excluded });
    }

    await client.query('BEGIN');

    const changes: string[] = [];
    const fmt = (v: number | null, excl: boolean) => (excl ? 'Not covered' : v == null ? 'self-pay' : `GHS ${Number(v).toFixed(2)}`);

    // 1. Self-pay → charge_master.price + cached clinics.consultation_price
    const newSelf = self_pay === '' || self_pay == null ? null : Number(self_pay);
    if (newSelf != null && !isNaN(newSelf) && Number(newSelf) !== Number(clinic.self_pay)) {
      await client.query('UPDATE charge_master SET price = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [newSelf, chargeId]);
      await client.query('UPDATE clinics SET consultation_price = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [newSelf, id]);
      changes.push(`Self-pay ${fmt(clinic.self_pay, false)} → ${fmt(newSelf, false)}`);
    }

    // 2. Payer prices → upsert payer_price_schedules
    for (const p of payers || []) {
      if (!p.payer_id || (p.payer_type !== 'insurance' && p.payer_type !== 'corporate')) continue;
      const price = p.excluded ? null : (p.price === '' || p.price == null ? null : Number(p.price));
      // Resolve payer name for the diff/notification
      const nameRes = await client.query(
        `SELECT name FROM ${p.payer_type === 'insurance' ? 'insurance_providers' : 'corporate_clients'} WHERE id = $1`,
        [p.payer_id]
      );
      const payerName = nameRes.rows[0]?.name || `payer ${p.payer_id}`;
      const before = beforeMap.get(payerName) || { price: null, excluded: false };

      if (p.payer_type === 'insurance') {
        await client.query(
          `INSERT INTO payer_price_schedules (charge_master_id, payer_type, insurance_provider_id, price, is_excluded)
           VALUES ($1,'insurance',$2,$3,$4)
           ON CONFLICT (charge_master_id, insurance_provider_id) WHERE payer_type='insurance'
           DO UPDATE SET price = EXCLUDED.price, is_excluded = EXCLUDED.is_excluded, updated_at = CURRENT_TIMESTAMP`,
          [chargeId, p.payer_id, price, p.excluded || false]
        );
      } else {
        await client.query(
          `INSERT INTO payer_price_schedules (charge_master_id, payer_type, corporate_client_id, price, is_excluded)
           VALUES ($1,'corporate',$2,$3,$4)
           ON CONFLICT (charge_master_id, corporate_client_id) WHERE payer_type='corporate'
           DO UPDATE SET price = EXCLUDED.price, is_excluded = EXCLUDED.is_excluded, updated_at = CURRENT_TIMESTAMP`,
          [chargeId, p.payer_id, price, p.excluded || false]
        );
      }
      const changedPrice = (before.price ?? null) !== (price ?? null) || before.excluded !== (p.excluded || false);
      if (changedPrice) changes.push(`${payerName} ${fmt(before.price, before.excluded)} → ${fmt(price, p.excluded || false)}`);
    }

    await client.query('COMMIT');

    if (changes.length > 0) {
      // Audit
      await auditService.log({
        userId: authUser?.id,
        action: 'update',
        entityType: 'clinic_pricing',
        entityId: Number(id),
        details: { clinic: clinic.name, changes },
        ipAddress: (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.socket?.remoteAddress,
        userAgent: req.headers['user-agent'] || undefined,
      });

      // Notify admins + super admins (excluding the actor) of who changed what
      const actorName = authUser ? `${authUser.username || 'A user'}` : 'A user';
      const summary = changes.slice(0, 6).join('; ') + (changes.length > 6 ? `; +${changes.length - 6} more` : '');
      try {
        const admins = await pool.query(
          'SELECT id FROM users WHERE (role = $1 OR is_super_admin = true) AND is_active = true AND id <> $2',
          ['admin', authUser?.id || 0]
        );
        for (const a of admins.rows) {
          await notificationService.send({
            userId: a.id,
            type: 'price_change',
            title: 'Clinic price changed',
            message: `${clinic.name} prices updated by ${actorName}: ${summary}`,
            entityType: 'clinic',
            entityId: Number(id),
          });
        }
      } catch (e) {
        console.error('Price-change notification failed (non-fatal):', e);
      }
    }

    res.json({ message: 'Clinic pricing updated', changes });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Update clinic pricing error:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
};

// Create a new clinic
export const createClinic = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, description, consultation_price } = req.body;

    if (!name || !name.trim()) {
      res.status(400).json({ error: 'Clinic name is required' });
      return;
    }

    const price = consultation_price === '' || consultation_price == null ? null : Number(consultation_price);
    if (price !== null && (isNaN(price) || price < 0)) {
      res.status(400).json({ error: 'Consultation price must be a positive number' });
      return;
    }

    const result = await pool.query(
      'INSERT INTO clinics (name, description, consultation_price) VALUES ($1, $2, $3) RETURNING *',
      [name.trim(), description?.trim() || null, price]
    );

    res.status(201).json({
      message: 'Clinic created successfully',
      clinic: result.rows[0],
    });
  } catch (error: any) {
    if (error.code === '23505') {
      res.status(409).json({ error: 'A clinic with this name already exists' });
      return;
    }
    console.error('Create clinic error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Update a clinic
export const updateClinic = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { name, description, consultation_price } = req.body;

    if (!name || !name.trim()) {
      res.status(400).json({ error: 'Clinic name is required' });
      return;
    }

    const price = consultation_price === '' || consultation_price == null ? null : Number(consultation_price);
    if (price !== null && (isNaN(price) || price < 0)) {
      res.status(400).json({ error: 'Consultation price must be a positive number' });
      return;
    }

    const result = await pool.query(
      `UPDATE clinics
       SET name = $1, description = $2, consultation_price = $3, updated_at = CURRENT_TIMESTAMP
       WHERE id = $4
       RETURNING *`,
      [name.trim(), description?.trim() || null, price, id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Clinic not found' });
      return;
    }

    res.json({
      message: 'Clinic updated successfully',
      clinic: result.rows[0],
    });
  } catch (error: any) {
    if (error.code === '23505') {
      res.status(409).json({ error: 'A clinic with this name already exists' });
      return;
    }
    console.error('Update clinic error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Deactivate a clinic (soft delete)
export const deactivateClinic = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `UPDATE clinics SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *`,
      [id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Clinic not found' });
      return;
    }

    res.json({ message: 'Clinic deactivated successfully' });
  } catch (error) {
    console.error('Deactivate clinic error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
