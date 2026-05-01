import type { PoolClient } from 'pg';
import pool from '../database/db';

interface ResolvedPrice {
  unitPrice: number;
  isExcluded: boolean;
  priceSource: 'cash' | 'payer_override' | 'lab_uniform';
}

/**
 * Resolves the correct price for a charge based on the invoice's payer source.
 *
 * Priority:
 * 1. Lab tests (category='lab') -> always use charge_master.price (MDS Lancet uniform)
 * 2. Self-pay or no payer -> use charge_master.price (cash rate)
 * 3. Insurance/corporate -> look up payer_price_schedules override
 * 4. No override found -> fall back to charge_master.price (cash rate)
 */
export async function resolvePrice(
  chargeId: number,
  invoiceId: number,
  dbClient?: PoolClient
): Promise<ResolvedPrice> {
  const queryFn = dbClient || pool;

  // Get charge details
  const chargeResult = await queryFn.query(
    'SELECT id, price, category FROM charge_master WHERE id = $1',
    [chargeId]
  );

  if (chargeResult.rows.length === 0) {
    throw new Error(`Charge not found: ${chargeId}`);
  }

  const charge = chargeResult.rows[0];
  const cashPrice = parseFloat(charge.price);

  // Lab tests use uniform MDS Lancet pricing for all payers
  if (charge.category === 'lab') {
    return { unitPrice: cashPrice, isExcluded: false, priceSource: 'lab_uniform' };
  }

  // Get the invoice's payer source
  const payerResult = await queryFn.query(
    `SELECT pps.payer_type, pps.insurance_provider_id, pps.corporate_client_id
     FROM invoices i
     LEFT JOIN patient_payer_sources pps ON i.payer_source_id = pps.id
     WHERE i.id = $1`,
    [invoiceId]
  );

  if (payerResult.rows.length === 0) {
    return { unitPrice: cashPrice, isExcluded: false, priceSource: 'cash' };
  }

  const payer = payerResult.rows[0];

  // Self-pay or no payer source -> cash rate
  if (!payer.payer_type || payer.payer_type === 'self_pay') {
    return { unitPrice: cashPrice, isExcluded: false, priceSource: 'cash' };
  }

  // Look up payer-specific price override
  let overrideResult;
  if (payer.payer_type === 'insurance' && payer.insurance_provider_id) {
    overrideResult = await queryFn.query(
      `SELECT price, is_excluded FROM payer_price_schedules
       WHERE charge_master_id = $1 AND payer_type = 'insurance' AND insurance_provider_id = $2`,
      [chargeId, payer.insurance_provider_id]
    );
  } else if (payer.payer_type === 'corporate' && payer.corporate_client_id) {
    overrideResult = await queryFn.query(
      `SELECT price, is_excluded FROM payer_price_schedules
       WHERE charge_master_id = $1 AND payer_type = 'corporate' AND corporate_client_id = $2`,
      [chargeId, payer.corporate_client_id]
    );
  }

  if (overrideResult && overrideResult.rows.length > 0) {
    const override = overrideResult.rows[0];
    if (override.is_excluded) {
      return { unitPrice: 0, isExcluded: true, priceSource: 'payer_override' };
    }
    return {
      unitPrice: parseFloat(override.price),
      isExcluded: false,
      priceSource: 'payer_override',
    };
  }

  // No override found -> fall back to cash rate
  return { unitPrice: cashPrice, isExcluded: false, priceSource: 'cash' };
}
