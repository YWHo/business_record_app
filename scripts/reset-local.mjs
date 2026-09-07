import { spawnSync } from 'node:child_process';
import { rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptsDirectory = dirname(fileURLToPath(import.meta.url));
const projectDirectory = resolve(scriptsDirectory, '..');
const stateDirectory = resolve(projectDirectory, '.wrangler', 'state');

if (!stateDirectory.endsWith('/.wrangler/state')) {
  throw new Error(`Refusing to reset unexpected path: ${stateDirectory}`);
}

await rm(stateDirectory, { recursive: true, force: true });

function runWrangler(arguments_) {
  const result = spawnSync('pnpm', ['exec', 'wrangler', ...arguments_], {
    cwd: projectDirectory,
    stdio: 'inherit',
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    globalThis.process.exit(result.status ?? 1);
  }
}

const localStateArguments = ['--local', '--persist-to', '.wrangler/state'];

runWrangler([
  'd1',
  'migrations',
  'apply',
  'business-records-local',
  ...localStateArguments,
]);
runWrangler([
  'd1',
  'execute',
  'business-records-local',
  ...localStateArguments,
  '--file',
  './scripts/seed-local.sql',
]);

globalThis.console.log('Local D1 and R2 state reset, migrated, and seeded.');
