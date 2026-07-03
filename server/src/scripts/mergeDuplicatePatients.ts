/**
 * Bulk duplicate-patient cleanup.
 *
 * Finds every group of non-merged patients sharing the same name + date of
 * birth and merges them down to a single survivor, using the same transactional
 * merge logic as the super-admin UI (performPatientMerge) — so CareCode
 * provenance is preserved on native survivors via carecode_origin_number.
 *
 * Survivor preference (per the clinic's decision — keep the native P-number):
 *   1. Native (source != 'carecode') records beat CareCode records.
 *   2. Within that, the record with the most encounters wins.
 *   3. Tie-break on lowest id (oldest record).
 *
 * Run a dry run first (default):
 *   cd server && npx ts-node src/scripts/mergeDuplicatePatients.ts
 * Execute for real:
 *   cd server && npx ts-node src/scripts/mergeDuplicatePatients.ts --execute
 */

import path from 'path';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
import pool from '../database/db';
import { performPatientMerge } from '../controllers/patientMergeController';

interface Candidate {
  id: number;
  patient_number: string;
  source: string;
  encounters: number;
}

const isNative = (c: Candidate) => c.source !== 'carecode';

// Pick the survivor for a duplicate group: native first, then most encounters, then oldest id.
const pickSurvivor = (group: Candidate[]): Candidate =>
  [...group].sort((a, b) => {
    if (isNative(a) !== isNative(b)) return isNative(a) ? -1 : 1;
    if (a.encounters !== b.encounters) return b.encounters - a.encounters;
    return a.id - b.id;
  })[0];

const run = async (): Promise<void> => {
  const execute = process.argv.includes('--execute');

  // Attribute merges to a super admin (merged_by). Falls back to null if none.
  const adminRes = await pool.query(
    "SELECT id, username FROM users WHERE is_super_admin = true ORDER BY id LIMIT 1"
  );
  const adminId: number | null = adminRes.rows[0]?.id ?? null;
  console.log(
    adminId
      ? `Attributing merges to super admin: ${adminRes.rows[0].username} (#${adminId})`
      : 'No super admin found — merges will record merged_by = NULL.'
  );

  // All non-merged patients grouped by name + DOB, with encounter counts.
  const { rows } = await pool.query<{
    fn: string; ln: string; dob: string | null;
    id: number; patient_number: string; source: string; encounters: string;
  }>(`
    SELECT LOWER(u.first_name) AS fn, LOWER(u.last_name) AS ln, p.date_of_birth AS dob,
           p.id, p.patient_number, p.source,
           (SELECT COUNT(*) FROM encounters e WHERE e.patient_id = p.id) AS encounters
    FROM patients p JOIN users u ON u.id = p.user_id
    WHERE p.merged_into IS NULL AND p.date_of_birth IS NOT NULL
    ORDER BY fn, ln, dob
  `);

  // Bucket into duplicate groups (same name + DOB, more than one record).
  const groups = new Map<string, Candidate[]>();
  for (const r of rows) {
    const key = `${r.fn}|${r.ln}|${r.dob}`;
    const c: Candidate = { id: r.id, patient_number: r.patient_number, source: r.source, encounters: Number(r.encounters) };
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(c);
  }
  const dupGroups = [...groups.entries()].filter(([, g]) => g.length > 1);

  console.log(`\n${execute ? 'EXECUTING' : 'DRY RUN'} — ${dupGroups.length} duplicate groups found.\n`);

  let merged = 0;
  let failed = 0;
  for (const [key, group] of dupGroups) {
    const [fn, ln, dob] = key.split('|');
    const survivor = pickSurvivor(group);
    const losers = group.filter((c) => c.id !== survivor.id);
    const label = `${fn} ${ln} (${dob})`;
    console.log(
      `• ${label}\n    survivor: ${survivor.patient_number} (#${survivor.id}, ${survivor.source}, ${survivor.encounters} enc)` +
      `\n    merge in: ${losers.map((l) => `${l.patient_number} (#${l.id}, ${l.source}, ${l.encounters} enc)`).join(', ')}`
    );

    if (!execute) continue;

    for (const loser of losers) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const outcome = await performPatientMerge(client, loser.id, survivor.id, adminId);
        await client.query('COMMIT');
        merged++;
        const note = outcome.carecodeOriginStamped ? ` [stamped origin ${outcome.carecodeOriginStamped}]` : '';
        console.log(`      ✓ ${loser.patient_number} → ${survivor.patient_number}${note}`);
      } catch (e: any) {
        await client.query('ROLLBACK');
        failed++;
        console.error(`      ✗ ${loser.patient_number} → ${survivor.patient_number}: ${e.message || e}`);
      } finally {
        client.release();
      }
    }
  }

  console.log(`\n=== ${execute ? 'Merge complete' : 'Dry run complete'} ===`);
  console.log(`Duplicate groups: ${dupGroups.length}`);
  console.log(`Records to merge away: ${dupGroups.reduce((n, [, g]) => n + g.length - 1, 0)}`);
  if (execute) {
    console.log(`Merged: ${merged}`);
    console.log(`Failed: ${failed}`);
  } else {
    console.log('\nRe-run with --execute to perform these merges.');
  }

  await pool.end();
};

run().catch((e) => { console.error(e); process.exit(1); });
