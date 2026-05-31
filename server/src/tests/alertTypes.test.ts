import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Static analysis test: ensures every alert_type string literal used in
 * workflowController.ts is listed in the CHECK constraint migration.
 *
 * This prevents the exact bug we fixed where a new alert_type was used in
 * code but not added to the database constraint, causing INSERT failures.
 */
describe('Alert Type Consistency', () => {
  // Extract the allowed alert types from the migration file
  const migrationPath = path.resolve(__dirname, '../database/migrations/updateAlertTypes.ts');
  const migrationSource = fs.readFileSync(migrationPath, 'utf-8');

  // Match all string literals inside the CHECK constraint's IN (...)
  // The migration has:  CHECK (alert_type IN ('patient_ready', 'ready_for_doctor', ...))
  const constraintMatch = migrationSource.match(/CHECK\s*\(alert_type\s+IN\s*\(([\s\S]*?)\)\)/i);
  const allowedTypes = new Set<string>();

  if (constraintMatch) {
    const literals = constraintMatch[1].match(/'([^']+)'/g);
    if (literals) {
      for (const lit of literals) {
        allowedTypes.add(lit.replace(/'/g, ''));
      }
    }
  }

  // Extract alert_type literals used in workflowController.ts
  const controllerPath = path.resolve(__dirname, '../controllers/workflowController.ts');
  const controllerSource = fs.readFileSync(controllerPath, 'utf-8');

  // Pattern 1: INSERT INTO alerts ... 'some_type' (type literal in VALUES or subquery)
  // We look for alert_type column usage patterns:
  //   - Literal strings right after "alert_type," in INSERT column lists won't capture the value
  //   - Instead, find all lines that contain INSERT INTO alerts and extract the string literal
  //     that corresponds to the alert_type position
  // Pattern 2: a.alert_type IN ('type1', 'type2') — read-only usage, still should be valid

  // More reliable: find all string literals that appear in alert-related INSERT statements
  // and alert_type IN (...) clauses.
  const usedTypes = new Set<string>();

  // Match INSERT INTO alerts ... VALUES patterns — the alert_type is always a literal string
  // in this codebase, appearing in the VALUES clause or SELECT subquery.
  // Examples from the code:
  //   "... $2, 'patient_ready', ..."
  //   "... 'ready_for_doctor', $5 ..."
  //   "... 'follow_up_care', $5 ..."
  //   "... 'vitals_critical', $2 ..."
  //   "... 'critical_priority', ..."
  //   "... 'ready_for_checkout', $4 ..."
  //   "... 'general', ..."

  // Find all INSERT INTO alerts statements and extract the alert_type literal
  const insertAlertBlocks = controllerSource.match(/INSERT INTO alerts[\s\S]*?(?:VALUES|SELECT)[\s\S]*?\)/g);
  if (insertAlertBlocks) {
    for (const block of insertAlertBlocks) {
      // The alert_type is a bare string literal in the VALUES/SELECT — find it
      const typeMatches = block.match(/'([a-z_]+)'/g);
      if (typeMatches) {
        for (const m of typeMatches) {
          const val = m.replace(/'/g, '');
          // Filter out obvious non-alert-type values (SQL keywords, column refs, etc.)
          // Alert types in this codebase follow the pattern: word_word (snake_case, 2+ segments)
          // or single known words
          const knownAlertTypes = [
            'patient_ready', 'ready_for_doctor', 'follow_up_care',
            'ready_for_checkout', 'vitals_critical', 'critical_priority',
            'urgent', 'general',
          ];
          // Only flag values that look like alert types (snake_case identifiers used in alert context)
          if (knownAlertTypes.includes(val) || val.match(/^[a-z]+(_[a-z]+)+$/)) {
            usedTypes.add(val);
          }
        }
      }
    }
  }

  // Also check alert_type IN (...) clauses for read queries
  const inClauses = controllerSource.match(/alert_type\s+IN\s*\(([^)]+)\)/g);
  if (inClauses) {
    for (const clause of inClauses) {
      const literals = clause.match(/'([^']+)'/g);
      if (literals) {
        for (const lit of literals) {
          usedTypes.add(lit.replace(/'/g, ''));
        }
      }
    }
  }

  it('should have extracted allowed types from migration', () => {
    expect(allowedTypes.size).toBeGreaterThan(0);
    // Verify known types are present
    expect(allowedTypes).toContain('patient_ready');
    expect(allowedTypes).toContain('ready_for_doctor');
    expect(allowedTypes).toContain('ready_for_checkout');
  });

  it('should have found alert_type usage in workflowController', () => {
    expect(usedTypes.size).toBeGreaterThan(0);
  });

  it('every alert_type used in workflowController.ts must be in the CHECK constraint', () => {
    const missing: string[] = [];
    for (const t of usedTypes) {
      if (!allowedTypes.has(t)) {
        missing.push(t);
      }
    }

    expect(
      missing,
      `These alert_type values are used in workflowController.ts but NOT in the CHECK constraint migration:\n  ${missing.join(', ')}\n\nAdd them to server/src/database/migrations/updateAlertTypes.ts`
    ).toEqual([]);
  });

  it('CHECK constraint should cover all known alert types used in INSERT statements', () => {
    // These are the specific types used in INSERT INTO alerts in workflowController
    const insertTypes = [
      'patient_ready',
      'general',
      'vitals_critical',
      'critical_priority',
      'ready_for_doctor',
      'follow_up_care',
      'ready_for_checkout',
    ];

    for (const t of insertTypes) {
      expect(allowedTypes, `alert_type '${t}' used in INSERT but missing from constraint`).toContain(t);
    }
  });
});
