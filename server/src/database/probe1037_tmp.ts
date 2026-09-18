import pool from './db';
const pid = 1037;
const step = async (name: string, fn: () => Promise<any>) => {
  try { const r = await fn(); console.log(`OK   ${name}  (${r.rows.length} rows)`); return r; }
  catch (e: any) { console.log(`FAIL ${name}  -> ${e.message}`); return null; }
};
(async () => {
  const enc = await step('recent_encounters', () => pool.query(`SELECT e.*, u.first_name||' '||u.last_name as provider_name FROM encounters e LEFT JOIN users u ON e.provider_id=u.id WHERE e.patient_id=$1 ORDER BY e.encounter_date DESC LIMIT 20`, [pid]));
  const ids = enc ? enc.rows.map((e: any) => e.id) : [];
  console.log('encounter ids:', JSON.stringify(ids));
  await step('clinical_notes', () => pool.query(`SELECT cn.*, u.first_name||' '||u.last_name as author_name FROM clinical_notes cn LEFT JOIN users u ON cn.created_by=u.id WHERE cn.encounter_id = ANY($1) ORDER BY cn.created_at ASC`, [ids]));
  await step('diagnoses', () => pool.query(`SELECT * FROM diagnoses WHERE encounter_id = ANY($1) ORDER BY type ASC, created_at ASC`, [ids]));
  await step('pharmacy_orders', () => pool.query(`SELECT * FROM pharmacy_orders WHERE encounter_id = ANY($1) ORDER BY created_at ASC`, [ids]));
  await step('hp_sections', () => pool.query(`SELECT hp.encounter_id, hp.section_id, hp.content, hp.completed FROM hp_sections hp WHERE hp.encounter_id = ANY($1) AND hp.content IS NOT NULL AND hp.content != '' ORDER BY hp.encounter_id ASC, hp.section_id ASC`, [ids]));
  await step('medications-union', () => pool.query(`SELECT po.id, COALESCE(NULLIF(TRIM(po.substitute_medication),''), po.medication_name) AS medication_name, po.dosage, po.frequency, po.route, po.status, po.ordered_date::timestamp AS start_date, po.dispensed_date::timestamp AS dispensed_date, (u.first_name||' '||u.last_name)::text AS provider, po.notes, 'prescription'::text AS source, po.created_at, (po.status NOT IN ('cancelled','rejected','returned','completed') AND (po.dispensed_date IS NULL OR (po.dispensed_date + (COALESCE(po.days_supply,30)||' days')::interval)::date >= CURRENT_DATE)) AS is_active FROM pharmacy_orders po LEFT JOIN users u ON po.ordering_provider=u.id WHERE po.patient_id=$1 AND po.status NOT IN ('cancelled','rejected') UNION ALL SELECT m.id, m.medication_name, m.dosage, m.frequency, m.route, m.status, m.start_date::timestamp, NULL::timestamp, (mu.first_name||' '||mu.last_name)::text, m.notes, 'medication'::text, m.created_at, (m.status='active') FROM medications m LEFT JOIN users mu ON m.prescribing_doctor=mu.id WHERE m.patient_id=$1 AND m.status='active' AND NOT EXISTS (SELECT 1 FROM pharmacy_orders po2 WHERE po2.patient_id=$1 AND po2.status NOT IN ('cancelled','rejected') AND (LOWER(TRIM(po2.medication_name))=LOWER(TRIM(m.medication_name)) OR LOWER(TRIM(COALESCE(po2.substitute_medication,'')))=LOWER(TRIM(m.medication_name)))) ORDER BY created_at DESC`, [pid]));
  await step('allergies', () => pool.query(`SELECT * FROM allergies WHERE patient_id=$1 ORDER BY severity DESC, created_at DESC`, [pid]));
  await step('appointments', () => pool.query(`SELECT a.*, u.first_name||' '||u.last_name as provider_name FROM appointments a LEFT JOIN users u ON a.provider_id=u.id WHERE a.patient_id=$1 AND a.appointment_date > CURRENT_TIMESTAMP ORDER BY a.appointment_date ASC LIMIT 5`, [pid]));
  await step('payer_sources', () => pool.query(`SELECT pps.*, cc.name, ip.name FROM patient_payer_sources pps LEFT JOIN corporate_clients cc ON pps.corporate_client_id=cc.id LEFT JOIN insurance_providers ip ON pps.insurance_provider_id=ip.id WHERE pps.patient_id=$1 ORDER BY pps.is_primary DESC`, [pid]));
  await step('balance', () => pool.query(`SELECT COALESCE(SUM(total_amount - COALESCE(amount_paid,0)),0) FROM invoices WHERE patient_id=$1 AND status IN ('pending','partial')`, [pid]));
  await pool.end();
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
