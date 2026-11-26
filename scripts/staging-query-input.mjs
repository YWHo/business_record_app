import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Preload before Wrangler's CLI main. SQL travels through stdin rather than a
// Windows command line, whose size limit is smaller than the fictional fixture.
const args = process.argv.slice(2);
if (
  JSON.stringify(args) !==
  JSON.stringify([
    '--config',
    fileURLToPath(new URL('../wrangler.jsonc', import.meta.url)),
    'd1',
    'execute',
    'DB',
    '--remote',
    '--env',
    'staging',
    '--command',
    'STAGING_SQL_FROM_STDIN',
    '--json',
  ])
) {
  throw new Error('Staging query input requires the exact guarded command.');
}
const sql = readFileSync(0, 'utf8');
if (!sql || Buffer.byteLength(sql) > 1024 * 1024) {
  throw new Error('Staging query input is empty or too large.');
}
process.argv[process.argv.indexOf('STAGING_SQL_FROM_STDIN')] = sql;
