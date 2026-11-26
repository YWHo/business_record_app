// @vitest-environment node
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { beforeEach, expect, it, vi } from 'vitest';
import { manageStaging, stagingArguments } from './manage-staging.mjs';
import {
  readDeploymentConfig,
  stagingBindings,
  stagingTarget,
} from './staging-config.mjs';
import {
  stagingFixtureSql,
  stagingFixtureVersion,
} from './staging-fixture.mjs';

const stagingId = '44444444-4444-4444-8444-444444444444';
let config;
beforeEach(() => {
  config = readDeploymentConfig();
  config.env.staging.d1_databases[0].database_id = stagingId;
});
function options(action = 'provision') {
  return stagingArguments([
    action,
    '--apply',
    '--confirm',
    stagingTarget,
    '--database-id',
    stagingId,
  ]);
}
function runner({
  profile = null,
  attachments = 0,
  info = { uuid: stagingId, name: stagingTarget },
} = {}) {
  return vi.fn((args, sql) => {
    if (args[1] === 'info') {
      return info;
    }
    if (args[1] === 'migrations') {
      return null;
    }
    if (sql.startsWith('SELECT')) {
      return [{ success: true, results: [{ profile, attachments }] }];
    }
    return [{ success: true, results: [] }];
  });
}

it.each(['inspect', 'provision', 'reset'])(
  'plans %s without any Wrangler call by default',
  (action) => {
    const run = vi.fn();
    const plan = manageStaging(stagingArguments([action]), {
      config,
      run,
      log: vi.fn(),
    });
    expect(plan).toMatchObject({
      apply: false,
      environment: 'staging',
      databaseName: stagingTarget,
      bucketName: `${stagingTarget}-documents`,
    });
    expect(run).not.toHaveBeenCalled();
  },
);
it('allows inspection but rejects applying the checked-in placeholder', () => {
  expect(stagingBindings(readDeploymentConfig()).configured).toBe(false);
  const run = vi.fn();
  expect(() =>
    manageStaging(options(), { config: readDeploymentConfig(), run }),
  ).toThrow('Configure a new staging D1 ID');
  expect(run).not.toHaveBeenCalled();
});
it.each([
  'database',
  'bucket',
  'worker',
  'origin',
  'limiter',
  'preview',
  'local-helper',
  'challenge',
])('rejects a %s alias or weakened guard before calling Wrangler', (kind) => {
  const staging = config.env.staging;
  if (kind === 'database') {
    staging.d1_databases[0].database_id =
      config.env.production.d1_databases[0].database_id.toUpperCase();
  }
  if (kind === 'bucket') {
    staging.r2_buckets[0].bucket_name =
      config.env.production.r2_buckets[0].bucket_name;
  }
  if (kind === 'worker') {
    staging.name = config.env.production.name;
  }
  if (kind === 'origin') {
    staging.vars.APP_ORIGIN = config.env.production.vars.APP_ORIGIN;
  }
  if (kind === 'limiter') {
    staging.ratelimits[0].namespace_id =
      config.env.production.ratelimits[0].namespace_id;
  }
  if (kind === 'preview') {
    staging.d1_databases[0].preview_database_id =
      config.env.production.d1_databases[0].database_id;
  }
  if (kind === 'local-helper') {
    staging.vars.LOCAL_AUTH_ENABLED = 'true';
  }
  if (kind === 'challenge') {
    staging.vars.TURNSTILE_REQUIRED = 'false';
  }
  const run = vi.fn();
  expect(() => manageStaging(options(), { config, run })).toThrow();
  expect(run).not.toHaveBeenCalled();
});
it.each([
  ['reset', '--apply'],
  ['reset', '--apply', '--confirm', 'business-records-production'],
  [
    'inspect',
    '--apply',
    '--confirm',
    stagingTarget,
    '--database-id',
    stagingId,
  ],
  ['reset', '--target', 'production'],
  ['reset', '--apply', '--apply'],
  ['reset', '--database-id'],
])('rejects incomplete or unexpected CLI options %j', (...args) => {
  expect(() => stagingArguments(args)).toThrow();
});
it('pins both confirmation and database ID before inspecting remote resources', () => {
  const run = runner();
  expect(() =>
    manageStaging(
      { ...options(), databaseId: config.env.demo.d1_databases[0].database_id },
      { config, run },
    ),
  ).toThrow('does not match');
  expect(run).not.toHaveBeenCalled();
});
it('checks the actual remote database name and UUID before migration or seeding', () => {
  const run = runner({
    info: { name: 'business-records-production', uuid: stagingId },
  });
  expect(() => manageStaging(options(), { config, run })).toThrow(
    'Remote database identity',
  );
  expect(run).toHaveBeenCalledTimes(1);
});
it('uses only staging-bound migration/query commands and never an R2 write or D1 file importer', () => {
  const run = runner();
  manageStaging(options(), { config, run, log: vi.fn() });
  expect(run.mock.calls.map(([args]) => args[0])).toEqual([
    'd1',
    'd1',
    'd1',
    'd1',
  ]);
  for (const [args] of run.mock.calls) {
    expect(args[args.indexOf('--env') + 1]).toBe('staging');
    expect(args).not.toContain('--file');
  }
  expect(run.mock.calls.at(-1)[1]).toContain(
    'CREATE TABLE staging_fixture_guard',
  );
});
it('provisioning an existing fixture preserves edits, disabled memberships and auditor expiry', () => {
  const run = runner({ profile: stagingFixtureVersion, attachments: 2 });
  manageStaging(options(), { config, run, log: vi.fn() });
  expect(run).toHaveBeenCalledTimes(3);
  expect(
    run.mock.calls.filter(([, sql]) => sql?.includes('DELETE FROM')),
  ).toEqual([]);
});
it.each([
  { profile: 'unknown', attachments: 0 },
  { profile: stagingFixtureVersion, attachments: 1 },
  { profile: null, attachments: 0 },
])('rejects an unsafe reset state %j before replacing records', (state) => {
  const run = runner(state);
  expect(() => manageStaging(options('reset'), { config, run })).toThrow();
  expect(
    run.mock.calls.filter(([, sql]) => sql?.includes('DELETE FROM')),
  ).toEqual([]);
});
it('stops immediately on a failed Wrangler operation without retrying', () => {
  const run = vi.fn(() => {
    throw new Error('Wrangler failed');
  });
  expect(() => manageStaging(options(), { config, run })).toThrow(
    'Wrangler failed',
  );
  expect(run).toHaveBeenCalledTimes(1);
});
it('passes the full fixture to a child through stdin without a large OS command line', () => {
  const sql = stagingFixtureSql('provision');
  expect(Buffer.byteLength(sql)).toBeGreaterThan(32768);
  const result = spawnSync(
    process.execPath,
    [
      '--import',
      new URL('./staging-query-input.mjs', import.meta.url).href,
      fileURLToPath(
        new URL('./fixtures/staging-query-probe.mjs', import.meta.url),
      ),
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
    ],
    { input: sql, encoding: 'utf8', windowsHide: true },
  );
  expect(result.status, result.stderr).toBe(0);
  expect(JSON.parse(result.stdout)).toEqual({
    bytes: Buffer.byteLength(sql),
    hash: createHash('sha256').update(sql).digest('hex'),
  });
});
