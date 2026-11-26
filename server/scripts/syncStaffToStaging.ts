/**
 * Copy named staff accounts from PROD to the STAGING database so they log in
 * to staging.medsys.healthcare with exactly their prod username + password
 * (same hash, role, super-admin flag, active state).
 *
 *   cd server
 *   STAGING_DATABASE_URL='postgres://…staging…' npx ts-node scripts/syncStaffToStaging.ts joseph charles irene angela sarah robert
 *   … add --apply to write (default is a dry run that only prints the matches)
 *
 * Each argument is a username, or a first name. A first name must match exactly
 * one active prod account, otherwise the candidates are listed and it is
 * skipped — pass the username instead. Prod is only read (read-only
 * transaction). Re-run after someone changes their prod password.
 */
import dotenv from 'dotenv';
import path from 'path';
import { Client } from 'pg';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const ssl = { rejectUnauthorized: false };

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const names = args.filter((a) => !a.startsWith('--')).map((a) => a.trim().toLowerCase());
  const prodUrl = process.env.DATABASE_URL;
  const stagingUrl = process.env.STAGING_DATABASE_URL;

  if (!names.length) throw new Error('Give at least one username or first name.');
  if (!prodUrl || !stagingUrl) throw new Error('Need DATABASE_URL (server/.env, prod) and STAGING_DATABASE_URL.');
  if (prodUrl === stagingUrl) throw new Error('STAGING_DATABASE_URL is the prod database — refusing.');

  const prod = new Client({ connectionString: prodUrl, ssl });
  const staging = new Client({ connectionString: stagingUrl, ssl });
  await prod.connect();
  await staging.connect();

  try {
    await prod.query('BEGIN READ ONLY');

    // Only columns both schemas have; id comes from staging's own sequence.
    const colsOf = async (c: Client) =>
      new Set(
        (await c.query(`SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users'`))
          .rows.map((r) => r.column_name as string)
      );
    const stagingCols = await colsOf(staging);
    const cols = [...(await colsOf(prod))].filter((c) => c !== 'id' && stagingCols.has(c));

    const picked: Record<string, unknown>[] = [];
    for (const n of names) {
      const r = await prod.query(
        `SELECT * FROM users
          WHERE is_active IS DISTINCT FROM false
            AND (LOWER(username) = $1 OR LOWER(first_name) = $1)
          ORDER BY (LOWER(username) = $1) DESC, id`,
        [n]
      );
      const exact = r.rows.filter((u) => String(u.username).toLowerCase() === n);
      const rows = exact.length ? exact : r.rows;
      if (rows.length === 1) {
        picked.push(rows[0]);
        const u = rows[0];
        console.log(`  ✓ ${n} → ${u.username} (${u.first_name} ${u.last_name}, ${u.role}${u.is_super_admin ? ', super admin' : ''})`);
      } else if (rows.length === 0) {
        console.log(`  ✗ ${n}: no active prod account`);
      } else {
        console.log(`  ? ${n}: ${rows.length} accounts — pass one username:`);
        rows.forEach((u) => console.log(`      ${u.username}  ${u.first_name} ${u.last_name}  (${u.role})`));
      }
    }
    await prod.query('COMMIT');

    if (!apply) {
      console.log(`\nDry run — nothing written. Add --apply to copy ${picked.length} account(s) to staging.`);
      return;
    }

    await staging.query('BEGIN');
    for (const u of picked) {
      const existing = await staging.query(`SELECT id FROM users WHERE LOWER(username) = LOWER($1)`, [u.username]);
      const vals = cols.map((c) => u[c]);
      if (existing.rows.length) {
        const sets = cols.map((c, i) => `"${c}" = $${i + 1}`).join(', ');
        await staging.query(`UPDATE users SET ${sets} WHERE id = $${cols.length + 1}`, [...vals, existing.rows[0].id]);
        console.log(`  updated ${u.username} on staging`);
      } else {
        const list = cols.map((c) => `"${c}"`).join(', ');
        const ph = cols.map((_, i) => `$${i + 1}`).join(', ');
        await staging.query(`INSERT INTO users (${list}) VALUES (${ph})`, vals);
        console.log(`  created ${u.username} on staging`);
      }
    }
    await staging.query('COMMIT');
    console.log(`\nDone — ${picked.length} account(s) can log in to staging with their prod password.`);
  } catch (e) {
    await staging.query('ROLLBACK').catch(() => undefined);
    throw e;
  } finally {
    await prod.end();
    await staging.end();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
