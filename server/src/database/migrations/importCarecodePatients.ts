/**
 * One-shot migration: import patient demographics from the clinic's
 * legacy "CareCode" EMR into MedSys.
 *
 * Source: docs/carecode-patients.json (produced from docs/patientlist.xlsx)
 *
 * Migrated patients are marked by prefixing patient_number with `CC-`
 * (e.g. `CC-MGC-01132-26`). Receptionists immediately know to verify
 * details on first visit.
 *
 * Idempotent: ON CONFLICT (patient_number) DO NOTHING. Re-running is a
 * no-op for already-imported rows.
 *
 * Skips rows missing DoB (49 in source data) and reports them — admin
 * can hand-enter those later when patients show up. Defaults missing
 * gender to 'Unknown'.
 *
 * Run with:
 *   cd server && npx ts-node src/database/migrations/importCarecodePatients.ts
 */

import { PoolClient } from 'pg';
import bcrypt from 'bcrypt';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
import pool from '../db';

interface SourcePatient {
  src_id: number;
  mrn: string;
  first_name: string;
  last_name: string;
  gender: string;
  dob_text: string | null;
  phone: string | null;
  first_mop: string | null;
  membership_number: string | null;
  first_visit_text: string | null;
}

// Parse the CareCode DoB / visit-date format ("14 Aug 1947")
const MONTHS: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
};

const parseDate = (text: string | null): string | null => {
  if (!text) return null;
  const m = String(text).trim().match(/^(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})$/);
  if (!m) return null;
  const day = m[1].padStart(2, '0');
  const monKey = m[2].slice(0, 3).toLowerCase();
  const mon = MONTHS[monKey];
  const year = m[3];
  if (!mon) return null;
  return `${year}-${mon}-${day}`;
};

// First MOP from CareCode → MedSys payment style.
// We just store it in insurance_provider for now; payer source linking
// can happen organically when the patient checks in.
const mopToInsuranceProvider = (mop: string | null): string | null => {
  if (!mop) return null;
  if (mop === 'Cash') return null; // no provider for cash
  return mop; // 'Private Insurance' / 'Corporate' stored verbatim
};

const importPatients = async (): Promise<void> => {
  const jsonPath = path.resolve(__dirname, '../../../../docs/carecode-patients.json');
  if (!fs.existsSync(jsonPath)) {
    console.error(`Source data missing: ${jsonPath}`);
    process.exit(1);
  }
  const rawPatients: SourcePatient[] = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
  console.log(`Loaded ${rawPatients.length} source records from CareCode export.`);

  const defaultPasswordHash = await bcrypt.hash('ChangeMe123!', 10);

  const client: PoolClient = await pool.connect();
  let inserted = 0;
  let skippedNoDob = 0;
  let skippedConflict = 0;
  let skippedNameOnly = 0;
  const failures: Array<{ mrn: string; reason: string }> = [];

  try {
    for (const p of rawPatients) {
      const patient_number = `CC-${p.mrn}`;
      const dob = parseDate(p.dob_text);

      if (!dob) {
        skippedNoDob++;
        failures.push({ mrn: p.mrn, reason: 'No DoB' });
        continue;
      }
      if (!p.last_name || p.last_name === '(unknown)') {
        skippedNameOnly++;
        failures.push({ mrn: p.mrn, reason: 'Last name missing' });
        continue;
      }

      // Skip duplicates without raising an exception (faster + cleaner log)
      const existing = await client.query(
        'SELECT id FROM patients WHERE patient_number = $1',
        [patient_number]
      );
      if (existing.rows.length > 0) {
        skippedConflict++;
        continue;
      }

      const fakeEmail = `${patient_number.toLowerCase().replace(/[^a-z0-9]/g, '-')}@noemail.medsys.local`;
      const username = `cc-${p.mrn.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;

      try {
        await client.query('BEGIN');

        const userResult = await client.query(
          `INSERT INTO users (username, email, password_hash, role, first_name, last_name, phone)
           VALUES ($1, $2, $3, 'patient', $4, $5, $6)
           ON CONFLICT (email) DO NOTHING
           RETURNING id`,
          [username, fakeEmail, defaultPasswordHash, p.first_name, p.last_name, p.phone]
        );

        if (userResult.rows.length === 0) {
          // Email collision (rare). Append src_id for uniqueness, retry once.
          const altEmail = `${patient_number.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${p.src_id}@noemail.medsys.local`;
          const altUsername = `cc-${p.mrn.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${p.src_id}`;
          const retry = await client.query(
            `INSERT INTO users (username, email, password_hash, role, first_name, last_name, phone)
             VALUES ($1, $2, $3, 'patient', $4, $5, $6)
             RETURNING id`,
            [altUsername, altEmail, defaultPasswordHash, p.first_name, p.last_name, p.phone]
          );
          if (retry.rows.length === 0) {
            await client.query('ROLLBACK');
            failures.push({ mrn: p.mrn, reason: 'User insert failed twice' });
            continue;
          }
          var user_id = retry.rows[0].id;
        } else {
          var user_id = userResult.rows[0].id;
        }

        await client.query(
          `INSERT INTO patients (
            user_id, patient_number, date_of_birth, gender,
            insurance_provider, insurance_number
          ) VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT (patient_number) DO NOTHING`,
          [
            user_id,
            patient_number,
            dob,
            p.gender || 'Unknown',
            mopToInsuranceProvider(p.first_mop),
            p.membership_number,
          ]
        );

        await client.query('COMMIT');
        inserted++;
        if (inserted % 50 === 0) {
          console.log(`  ...inserted ${inserted}`);
        }
      } catch (err: any) {
        await client.query('ROLLBACK');
        failures.push({ mrn: p.mrn, reason: err.message || String(err) });
      }
    }
  } finally {
    client.release();
  }

  console.log('\n=== CareCode import complete ===');
  console.log(`Inserted:           ${inserted}`);
  console.log(`Skipped (no DoB):   ${skippedNoDob}`);
  console.log(`Skipped (no name):  ${skippedNameOnly}`);
  console.log(`Skipped (already):  ${skippedConflict}`);
  console.log(`Failures:           ${failures.length - skippedNoDob - skippedNameOnly}`);

  if (failures.length > 0) {
    const reportPath = path.resolve(__dirname, '../../../../docs/carecode-import-skipped.json');
    fs.writeFileSync(reportPath, JSON.stringify(failures, null, 2));
    console.log(`Skipped/failed rows written to ${reportPath}`);
  }
};

importPatients()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Import failed:', err);
    process.exit(1);
  });
