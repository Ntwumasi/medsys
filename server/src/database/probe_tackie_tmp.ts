import pool from './db';
(async () => {
  const pats = await pool.query(
    `SELECT p.id, p.patient_number, p.user_id, u.first_name, u.last_name, p.date_of_birth, p.created_at
       FROM patients p LEFT JOIN users u ON p.user_id = u.id
      WHERE p.patient_number = 'P000928'
         OR ((lower(u.first_name) LIKE '%nii%' OR lower(u.first_name) LIKE '%lartey%')
             AND lower(u.last_name) LIKE '%tackie%')
         OR lower(u.last_name) LIKE '%tackie%'
      ORDER BY p.id`);
  console.log('=== Matching patients ===');
  console.log(JSON.stringify(pats.rows, null, 2));

  for (const p of pats.rows) {
    const enc = await pool.query(
      `SELECT id, encounter_number, encounter_date, encounter_type, status FROM encounters WHERE patient_id=$1 ORDER BY encounter_date DESC`, [p.id]);
    console.log(`\n=== patient_id ${p.id} (${p.patient_number} ${p.first_name} ${p.last_name}): ${enc.rows.length} encounters ===`);
    console.log(JSON.stringify(enc.rows, null, 2));
  }
  await pool.end();
})().catch(e => { console.error('ERR:', e.message); process.exit(1); });
