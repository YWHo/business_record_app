import { spawnSync } from 'node:child_process';
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
});
