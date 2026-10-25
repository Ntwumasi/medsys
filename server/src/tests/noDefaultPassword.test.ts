import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// The shared `demo123` password was retired 2026-10-25. Only the migration
// that retires it may still use it as a value.
const ALLOWED = new Set(['retireDemo123Password.ts', 'noDefaultPassword.test.ts']);

const files = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? files(path.join(dir, e.name)) : e.name.endsWith('.ts') ? [path.join(dir, e.name)] : []);

describe('no shared default password', () => {
  it('no server code sets or prints demo123', () => {
    const offenders = files(path.join(__dirname, '..'))
      .filter((f) => !ALLOWED.has(path.basename(f)))
      .filter((f) => /['"]demo123['"]|\/ demo123/.test(fs.readFileSync(f, 'utf8')));
    expect(offenders.map((f) => path.relative(path.join(__dirname, '..'), f))).toEqual([]);
  });
});
