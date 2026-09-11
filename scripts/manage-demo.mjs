import { spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';

const target = 'business-records-demo';
const action = process.argv[2];
const confirmationIndex = process.argv.indexOf('--confirm');
let confirmation =
  confirmationIndex >= 0 ? process.argv[confirmationIndex + 1] : '';

if (action !== 'seed' && action !== 'reset') {
  throw new Error(
    'Usage: manage-demo.mjs <seed|reset> [--confirm business-records-demo]',
  );
}

if (!confirmation && process.stdin.isTTY) {
  const prompt = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  confirmation = await prompt.question(
    `This replaces every record in the remote ${target} D1 database. Type ${target} to continue: `,
  );
  prompt.close();
}

if (confirmation !== target) {
  throw new Error(
    `Demo reset cancelled. Re-run interactively or pass --confirm ${target}.`,
  );
}

function runWrangler(arguments_) {
  const result = spawnSync('pnpm', ['exec', 'wrangler', ...arguments_], {
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

if (action === 'reset') {
  runWrangler(['d1', 'migrations', 'apply', 'DB', '--remote', '--env', 'demo']);
}

runWrangler([
  'd1',
  'execute',
  'DB',
  '--remote',
  '--env',
  'demo',
  '--file',
  './scripts/seed-demo.sql',
]);

console.log(
  `Remote ${target} data ${action === 'reset' ? 'reset' : 'seeded'}.`,
);
