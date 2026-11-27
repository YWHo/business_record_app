// @vitest-environment node
import { beforeAll, expect, it, vi } from 'vitest';
import {
  createStagingCredentialSecret,
  stagingIdentitySyncSql,
} from './staging-identities.mjs';
import {
  parseStagingCredentials,
  verifyStagingPassword,
  validStagingPassword,
  stagingCredentialFingerprint,
} from '../shared/staging-credentials.mjs';
import { manageStaging, stagingArguments } from './manage-staging.mjs';
import { readDeploymentConfig } from './staging-config.mjs';
import { stagingFixtureVersion } from './staging-fixture.mjs';

const password = 'fictional-test-password-2026';
let secret;
let config;
beforeAll(async () => {
  secret = await createStagingCredentialSecret(
    JSON.stringify({
      identities: ['OWNER', 'ACCOUNTANT', 'AUDITOR'].map((role) => ({
        role,
        email: `${role.toLowerCase()}@example.invalid`,
        password,
      })),
    }),
  );
  config = readDeploymentConfig();
  config.env.staging.d1_databases[0].database_id =
    '44444444-4444-4444-8444-444444444444';
});
it('creates distinct salted verifiers, never serializes passwords, and verifies the exact input', async () => {
  const identities = parseStagingCredentials(secret);
  expect(secret).not.toContain(password);
  expect(new Set(identities.map((entry) => entry.verifier)).size).toBe(3);
  expect(await verifyStagingPassword(password, identities[0].verifier)).toBe(
    true,
  );
  expect(
    await verifyStagingPassword(`${password} `, identities[0].verifier),
  ).toBe(false);
  expect(await stagingCredentialFingerprint(identities[0])).toMatch(
    /^[a-f0-9]{64}$/,
  );
});
it.each([
  (data) => {
    data.identities[0].password = password;
  },
  (data) => {
    data.identities[0].verifier = data.identities[0].verifier.replace(
      '32768',
      '1024',
    );
  },
  (data) => {
    data.identities[1].email = data.identities[0].email.toUpperCase();
  },
  (data) => {
    data.identities[1].role = 'OWNER';
  },
  (data) => {
    data.identities[1].verifier = data.identities[0].verifier;
  },
  (data) => {
    data.identities.pop();
  },
  (data) => {
    data.version = 2;
  },
])('rejects ambiguous, weak or unexpected secret configuration', (mutate) => {
  const data = JSON.parse(secret);
  mutate(data);
  expect(() => parseStagingCredentials(JSON.stringify(data))).toThrow(
    'Staging credentials are missing or invalid.',
  );
});
it('bounds password bytes without silently trimming or normalizing', () => {
  expect(validStagingPassword('a'.repeat(15))).toBe(false);
  expect(validStagingPassword('a'.repeat(16))).toBe(true);
  expect(validStagingPassword('a'.repeat(129))).toBe(false);
  expect(validStagingPassword('😀'.repeat(33))).toBe(false);
});
it('plans sync without reading credentials or accessing Wrangler', () => {
  const credentials = vi.fn();
  const run = vi.fn();
  expect(
    manageStaging(stagingArguments(['sync']), {
      config,
      credentials,
      run,
      log: vi.fn(),
    }),
  ).toMatchObject({ apply: false });
  expect(credentials).not.toHaveBeenCalled();
  expect(run).not.toHaveBeenCalled();
});
it('rejects a missing password limiter before an operator can apply', () => {
  const weakened = structuredClone(config);
  weakened.env.staging.ratelimits = weakened.env.staging.ratelimits.filter(
    (limit) => limit.name !== 'STAGING_PASSWORD_RATE_LIMITER',
  );
  const run = vi.fn();
  const credentials = vi.fn();
  expect(() =>
    manageStaging(syncOptions(), { config: weakened, run, credentials }),
  ).toThrow('rate-limit bindings');
  expect(run).not.toHaveBeenCalled();
  expect(credentials).not.toHaveBeenCalled();
});
function syncOptions() {
  return stagingArguments([
    'sync',
    '--apply',
    '--confirm',
    'business-records-staging',
    '--database-id',
    config.env.staging.d1_databases[0].database_id,
  ]);
}
it('rejects invalid credentials before any remote operation', async () => {
  const run = vi.fn();
  await expect(
    manageStaging(syncOptions(), {
      config,
      credentials: () => '{}',
      run,
      log: vi.fn(),
    }),
  ).rejects.toThrow();
  expect(run).not.toHaveBeenCalled();
});
it('syncs only fingerprints and email through guarded staging commands', async () => {
  const run = vi.fn((args, sql) => {
    if (args[1] === 'info') {
      return {
        uuid: config.env.staging.d1_databases[0].database_id,
        name: 'business-records-staging',
      };
    }
    if (args[1] === 'migrations') {
      return null;
    }
    if (sql.startsWith('SELECT')) {
      return [
        {
          success: true,
          results: [{ profile: stagingFixtureVersion, attachments: 1 }],
        },
      ];
    }
    return [{ success: true, results: [] }];
  });
  const log = vi.fn();
  await manageStaging(syncOptions(), {
    config,
    credentials: () => secret,
    run,
    log,
  });
  const sql = run.mock.calls.at(-1)[1];
  expect(sql).toBe(await stagingIdentitySyncSql(secret));
  expect(sql).not.toContain('scrypt$');
  expect(sql).not.toContain(password);
  expect(sql).not.toMatch(
    /UPDATE business_account_members|INSERT INTO users|INSERT INTO business_account_members/,
  );
  expect(JSON.stringify(log.mock.calls)).not.toContain(secret);
  for (const [args] of run.mock.calls) {
    expect(args[args.indexOf('--env') + 1]).toBe('staging');
    expect(args).not.toContain('--file');
  }
});
