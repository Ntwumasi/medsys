import pool from './db';
const q = async (label: string, sql: string, p: any[] = []) => {
  const r = await pool.query(sql, p); console.log(`\n### ${label}`); console.log(JSON.stringify(r.rows, null, 2)); };
(async () => {
  await q('payer sources for 169 & 181', `SELECT id, patient_id, payer_type, is_primary, corporate_client_id, insurance_provider_id FROM patient_payer_sources WHERE patient_id IN (169,181) ORDER BY patient_id`);
  await q('patients flags (169,181)', `SELECT id, patient_number, user_id, is_active FROM patients WHERE id IN (169,181)`);
  await q('users flags (316,329)', `SELECT id, username, role, is_active FROM users WHERE id IN (316,329)`);
  await q('patients merge-tracking columns?', `SELECT column_name FROM information_schema.columns WHERE table_name='patients' AND (column_name ILIKE '%merg%' OR column_name ILIKE '%active%' OR column_name ILIKE '%notes%' OR column_name ILIKE '%status%')`);
  await pool.end();
})().catch(e => { console.error('ERR:', e.message); process.exit(1); });
