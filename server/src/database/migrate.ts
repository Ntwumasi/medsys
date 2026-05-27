import pool from './db';
import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';

/**
 * Migration Runner for MedSys EMR
 *
 * Tracks executed migrations in a `_migrations` table and runs pending ones
 * via subprocess (safe for files that auto-execute on import).
 *
 * Usage:
 *   npx ts-node src/database/migrate.ts              # Run pending migrations
 *   npx ts-node src/database/migrate.ts --status      # Show migration status
 *   npx ts-node src/database/migrate.ts --dry-run     # Show what would run
 *   npx ts-node src/database/migrate.ts --seed        # Mark all existing as executed (first-time setup)
 */

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

async function ensureTrackingTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) UNIQUE NOT NULL,
      executed_at TIMESTAMPTZ DEFAULT NOW(),
      duration_ms INTEGER
    )
  `);
}

async function getExecutedMigrations(): Promise<Set<string>> {
  const result = await pool.query('SELECT name FROM _migrations ORDER BY name');
  return new Set(result.rows.map((r: { name: string }) => r.name));
}

function getAllMigrationFiles(): string[] {
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.ts') && !f.startsWith('.'))
    .sort();
}

async function showStatus(): Promise<void> {
  await ensureTrackingTable();
  const executed = await getExecutedMigrations();
  const allFiles = getAllMigrationFiles();

  const pending = allFiles.filter((f) => !executed.has(f));
  const ran = allFiles.filter((f) => executed.has(f));

  console.log(`\n  Migrations: ${allFiles.length} total, ${ran.length} executed, ${pending.length} pending\n`);

  if (pending.length > 0) {
    console.log('  Pending:');
    pending.forEach((f) => console.log(`    - ${f}`));
  } else {
    console.log('  All migrations have been executed.');
  }
  console.log();
}

async function seedAllAsExecuted(): Promise<void> {
  await ensureTrackingTable();
  const executed = await getExecutedMigrations();
  const allFiles = getAllMigrationFiles();
  const toSeed = allFiles.filter((f) => !executed.has(f));

  if (toSeed.length === 0) {
    console.log('  All migrations already recorded. Nothing to seed.');
    return;
  }

  console.log(`\n  Seeding ${toSeed.length} migrations as already executed...\n`);
  for (const file of toSeed) {
    await pool.query(
      'INSERT INTO _migrations (name, duration_ms) VALUES ($1, $2) ON CONFLICT (name) DO NOTHING',
      [file, 0]
    );
    console.log(`    Recorded: ${file}`);
  }
  console.log(`\n  Done. ${toSeed.length} migrations marked as executed.\n`);
}

async function runMigrations(dryRun: boolean): Promise<void> {
  await ensureTrackingTable();
  const executed = await getExecutedMigrations();
  const allFiles = getAllMigrationFiles();
  const pending = allFiles.filter((f) => !executed.has(f));

  if (pending.length === 0) {
    console.log('\n  No pending migrations.\n');
    return;
  }

  if (dryRun) {
    console.log(`\n  Dry run — ${pending.length} migrations would execute:\n`);
    pending.forEach((f) => console.log(`    - ${f}`));
    console.log();
    return;
  }

  console.log(`\n  Running ${pending.length} pending migrations...\n`);

  for (const file of pending) {
    const filePath = path.join(MIGRATIONS_DIR, file);
    const start = Date.now();

    process.stdout.write(`    Running: ${file} ... `);

    try {
      execSync(`npx ts-node "${filePath}"`, {
        cwd: path.join(__dirname, '..', '..'),
        env: { ...process.env },
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 120_000,
      });

      const durationMs = Date.now() - start;

      await pool.query(
        'INSERT INTO _migrations (name, duration_ms) VALUES ($1, $2)',
        [file, durationMs]
      );

      console.log(`OK (${durationMs}ms)`);
    } catch (err: unknown) {
      const durationMs = Date.now() - start;
      console.log(`FAILED (${durationMs}ms)`);

      if (err instanceof Error && 'stderr' in err) {
        const stderr = (err as { stderr: Buffer }).stderr?.toString().trim();
        if (stderr) {
          console.error(`\n  Error output:\n${stderr.split('\n').map(l => `    ${l}`).join('\n')}\n`);
        }
      }

      console.error(`  Stopping migration run. Fix the issue and re-run.\n`);
      process.exit(1);
    }
  }

  console.log(`\n  All ${pending.length} migrations completed successfully.\n`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const flag = args[0];

  try {
    if (flag === '--status') {
      await showStatus();
    } else if (flag === '--seed') {
      await seedAllAsExecuted();
    } else if (flag === '--dry-run') {
      await runMigrations(true);
    } else {
      await runMigrations(false);
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Migration runner failed:', err);
  process.exit(1);
});
