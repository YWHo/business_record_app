import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { pathToFileURL } from 'node:url';
import {
  readDeploymentConfig,
  stagingBindings,
  stagingTarget,
  assertRemoteStagingDatabase,
} from './staging-config.mjs';
import {
  stagingFixtureSql,
  stagingFixtureVersion,
} from './staging-fixture.mjs';

export function stagingArguments(args) {
  const [action = 'inspect', ...rest] = args;
  if (!['inspect', 'provision', 'reset'].includes(action)) {
    throw new Error('Use inspect, provision or reset.');
  }
  const options = { action, apply: false, confirmation: '', databaseId: '' };
  const seen = new Set();
  for (let index = 0; index < rest.length; index += 1) {
    const flag = rest[index];
    if (seen.has(flag)) {
      throw new Error('Duplicate staging option.');
    }
    seen.add(flag);
    if (flag === '--apply') {
      options.apply = true;
    } else if (flag === '--confirm' || flag === '--database-id') {
      const value = rest[++index];
      if (!value || value.startsWith('--')) {
        throw new Error('Missing staging option value.');
      }
      options[flag === '--confirm' ? 'confirmation' : 'databaseId'] = value;
    } else {
      throw new Error('Unknown staging option.');
    }
  }
  if (
    options.apply &&
    (action === 'inspect' ||
      options.confirmation !== stagingTarget ||
      !options.databaseId)
  ) {
    throw new Error(
      'Applying requires --confirm business-records-staging and --database-id <staging UUID>.',
    );
  }
  return options;
}

function runWrangler(args, sql) {
  const cli = fileURLToPath(
    new URL('../node_modules/wrangler/wrangler-dist/cli.js', import.meta.url),
  );
  const preload = new URL('./staging-query-input.mjs', import.meta.url).href;
  const result = spawnSync(
    process.execPath,
    [
      ...(sql ? ['--import', preload] : []),
      cli,
      '--config',
      fileURLToPath(new URL('../wrangler.jsonc', import.meta.url)),
      ...args,
    ],
    {
      cwd: fileURLToPath(new URL('../', import.meta.url)),
      input: sql,
      encoding: 'utf8',
      maxBuffer: 2 * 1024 * 1024,
      windowsHide: true,
      env: { ...process.env, WRANGLER_SEND_METRICS: 'false' },
    },
  );
  if (result.error || result.status !== 0) {
    throw new Error(
      'Staging Wrangler command failed. No automatic retry was attempted.',
    );
  }
  if (!args.includes('--json')) {
    return null;
  }
  try {
    return JSON.parse(result.stdout);
  } catch {
    throw new Error('Staging Wrangler returned invalid JSON.');
  }
}

function queryRows(output) {
  if (
    !Array.isArray(output) ||
    output.length !== 1 ||
    output[0]?.success !== true ||
    !Array.isArray(output[0].results)
  ) {
    throw new Error('Unexpected staging query result.');
  }
  return output[0].results;
}

export function manageStaging(
  options,
  {
    config = readDeploymentConfig(),
    run = runWrangler,
    log = console.log,
  } = {},
) {
  const bindings = stagingBindings(config, { applying: options.apply });
  const plan = {
    ...bindings,
    action: options.action,
    apply: options.apply,
    migrations: [
      'd1',
      'migrations',
      'apply',
      'DB',
      '--remote',
      '--env',
      'staging',
    ],
    fixture: stagingFixtureVersion,
    r2: 'untouched; reset refuses existing attachment metadata',
  };
  if (!options.apply) {
    log(JSON.stringify(plan, null, 2));
    return plan;
  }
  if (
    options.confirmation !== stagingTarget ||
    options.databaseId.toLowerCase() !== bindings.databaseId.toLowerCase() ||
    !['provision', 'reset'].includes(options.action)
  ) {
    throw new Error('Staging confirmation or database ID does not match.');
  }
  assertRemoteStagingDatabase(
    run(['d1', 'info', 'DB', '--env', 'staging', '--json']),
    bindings,
  );
  // Migrations are additive; fixture replacement is separately guarded below.
  run(plan.migrations);
  const inspectSql =
    "SELECT (SELECT value FROM runtime_metadata WHERE key='staging_fixture_version') AS profile,(SELECT count(*) FROM attachments) AS attachments;";
  const command = [
    'd1',
    'execute',
    'DB',
    '--remote',
    '--env',
    'staging',
    '--command',
    'STAGING_SQL_FROM_STDIN',
    '--json',
  ];
  const [state] = queryRows(run(command, inspectSql));
  if (!state || !Number.isInteger(state.attachments)) {
    throw new Error('Staging inspection failed closed.');
  }
  if (
    state.profile === stagingFixtureVersion &&
    options.action === 'provision'
  ) {
    log(
      'Staging fixture already provisioned; memberships, expiry and records preserved.',
    );
    return plan;
  }
  if (
    (options.action === 'reset' && state.profile !== stagingFixtureVersion) ||
    (state.profile && state.profile !== stagingFixtureVersion)
  ) {
    throw new Error(
      'Refusing to adopt or reset an unrecognized staging fixture.',
    );
  }
  if (state.attachments !== 0) {
    throw new Error(
      'Staging contains attachments. Review and clean disposable evidence before resetting metadata; R2 was not changed.',
    );
  }
  const result = run(command, stagingFixtureSql(options.action));
  if (
    !Array.isArray(result) ||
    !result.length ||
    result.some((entry) => entry.success !== true)
  ) {
    throw new Error('Staging fixture query did not report success.');
  }
  log(
    `Staging ${options.action} completed for ${bindings.databaseName}. No R2 objects or credentials were changed.`,
  );
  return plan;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  manageStaging(stagingArguments(process.argv.slice(2)));
}
