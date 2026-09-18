import pool from './db';
const q = async (label: string, sql: string, p: any[] = []) => {
  try { const r = await pool.query(sql, p); console.log(`\n### ${label}`); console.log(JSON.stringify(r.rows, null, 2)); }
  catch(e:any){ console.log(`\n### ${label}: ERR ${e.message}`);} };
(async () => {
  await q('patients columns', `SELECT column_name, data_type FROM information_schema.columns WHERE table_name='patients' ORDER BY ordinal_position`);
  await q('users flags (316,329)', `SELECT id, username, role, is_active FROM users WHERE id IN (316,329)`);
  await pool.end();
})().catch(e => { console.error('ERR:', e.message); process.exit(1); });
