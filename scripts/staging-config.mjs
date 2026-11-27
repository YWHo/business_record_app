import { readFileSync } from 'node:fs';
import ts from 'typescript';

export const stagingTarget = 'business-records-staging';
export const stagingDatabasePlaceholder =
  '00000000-0000-4000-8000-000000000000';
export function readDeploymentConfig() {
  const parsed = ts.parseConfigFileTextToJson(
    'wrangler.jsonc',
    readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8'),
  );
  if (parsed.error) {
    throw new Error('Cannot parse deployment configuration.');
  }
  return parsed.config;
}
export function stagingBindings(config, { applying = false } = {}) {
  const staging = config.env?.staging;
  if (
    staging?.name !== stagingTarget ||
    staging.vars?.APP_ENV !== 'staging' ||
    staging.vars.LOCAL_AUTH_ENABLED !== 'false' ||
    staging.vars.TURNSTILE_REQUIRED !== 'true' ||
    !config.compatibility_flags?.includes('nodejs_compat') ||
    staging.limits?.cpu_ms !== 1000
  ) {
    throw new Error('Staging environment guards are invalid.');
  }
  const database = staging.d1_databases?.[0];
  const bucket = staging.r2_buckets?.[0];
  if (
    staging.d1_databases?.length !== 1 ||
    staging.r2_buckets?.length !== 1 ||
    database?.binding !== 'DB' ||
    database.database_name !== stagingTarget ||
    database.migrations_dir !== 'migrations' ||
    !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(
      database.database_id,
    ) ||
    bucket?.binding !== 'DOCUMENTS' ||
    bucket.bucket_name !== `${stagingTarget}-documents` ||
    database.preview_database_id ||
    bucket.preview_bucket_name ||
    database.remote ||
    bucket.remote
  ) {
    throw new Error('Staging must use its own named D1 and R2 bindings.');
  }
  const otherEnvironments = [
    config,
    ...Object.entries(config.env)
      .filter(([name]) => name !== 'staging')
      .map(([, value]) => value),
  ];
  const origin = new URL(staging.vars.APP_ORIGIN);
  if (
    origin.protocol !== 'https:' ||
    origin.origin !== staging.vars.APP_ORIGIN
  ) {
    throw new Error('Staging requires a distinct HTTPS origin.');
  }
  const limits = staging.ratelimits ?? [];
  if (
    limits.some((limit) => !/^[1-9]\d*$/.test(String(limit.namespace_id))) ||
    ![
      'AUTH_RATE_LIMITER',
      'INVITE_RATE_LIMITER',
      'EXPENSIVE_RATE_LIMITER',
      'STAGING_PASSWORD_RATE_LIMITER',
    ].every((name) => limits.some((limit) => limit.name === name)) ||
    new Set(limits.map((limit) => String(limit.namespace_id))).size !==
      limits.length
  ) {
    throw new Error('Staging rate-limit bindings are incomplete or aliased.');
  }
  for (const other of otherEnvironments) {
    if (
      other.name === staging.name ||
      (other.vars?.APP_ORIGIN &&
        new URL(other.vars.APP_ORIGIN).origin === origin.origin) ||
      other.d1_databases?.some(
        (row) =>
          [row.database_id, row.preview_database_id].some(
            (id) => id?.toLowerCase() === database.database_id.toLowerCase(),
          ) || row.database_name === database.database_name,
      ) ||
      other.r2_buckets?.some((row) =>
        [row.bucket_name, row.preview_bucket_name].includes(bucket.bucket_name),
      ) ||
      other.ratelimits?.some((row) =>
        limits.some(
          (limit) => String(limit.namespace_id) === String(row.namespace_id),
        ),
      )
    ) {
      throw new Error('Staging aliases another environment resource.');
    }
  }
  if (applying && database.database_id === stagingDatabasePlaceholder) {
    throw new Error('Configure a new staging D1 ID before applying.');
  }
  return {
    worker: staging.name,
    environment: 'staging',
    databaseId: database.database_id,
    databaseName: database.database_name,
    bucketName: bucket.bucket_name,
    origin: origin.origin,
    configured: database.database_id !== stagingDatabasePlaceholder,
  };
}

export function assertRemoteStagingDatabase(info, bindings) {
  if (
    !info ||
    info.uuid?.toLowerCase() !== bindings.databaseId.toLowerCase() ||
    info.name !== stagingTarget
  ) {
    throw new Error(
      'Remote database identity does not match the staging binding.',
    );
  }
}
