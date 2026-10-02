import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('remote demo administration safety', () => {
  it('rejects a production target as reset confirmation', () => {
    const result = spawnSync(
      process.execPath,
      [
        './scripts/manage-demo.mjs',
        'reset',
        '--confirm',
        'business-records-production',
      ],
      { cwd: process.cwd(), encoding: 'utf8' },
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Demo reset cancelled.');
  });

  it('uses the transactional query path instead of the D1 file importer', () => {
    const script = readFileSync('./scripts/manage-demo.mjs', 'utf8');

    expect(script).toContain("'--command',\n  seedSql");
    expect(script).not.toContain("'--file',\n  './scripts/seed-demo.sql'");
  });
});
