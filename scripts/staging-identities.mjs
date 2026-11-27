import {
  parseStagingCredentials,
  stagingCredentialFingerprint,
  stagingRoles,
  stagingEmail,
  validStagingPassword,
  createStagingVerifier,
} from '../shared/staging-credentials.mjs';
import { stagingFixtureVersion } from './staging-fixture.mjs';

function literal(value) {
  return `'${value.replaceAll("'", "''")}'`;
}
export async function stagingIdentitySyncSql(raw) {
  const identities = parseStagingCredentials(raw);
  const conditions = identities.map(
    (identity) =>
      `EXISTS (SELECT 1 FROM users u JOIN business_account_members m ON m.user_id=u.id WHERE u.id=${literal(identity.id)} AND u.role=${literal(identity.role)} AND m.business_account_id='business-account-primary' AND m.role=${literal(identity.role)})`,
  );
  let sql = `CREATE TABLE staging_identity_sync_guard(valid INTEGER NOT NULL CHECK(valid=1));
INSERT INTO staging_identity_sync_guard VALUES(CASE WHEN (SELECT value FROM runtime_metadata WHERE key='staging_fixture_version')='${stagingFixtureVersion}' AND ${conditions.join(' AND ')} THEN 1 ELSE 0 END);`;
  for (const identity of identities) {
    const fingerprint = await stagingCredentialFingerprint(identity);
    sql += `
DELETE FROM sessions WHERE user_id=${literal(identity.id)} AND (staging_credential_version IS NULL OR staging_credential_version<>${literal(fingerprint)});
UPDATE users SET email=${literal(identity.email)},updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=${literal(identity.id)} AND email<>${literal(identity.email)};
INSERT INTO staging_auth_identities(user_id,credential_fingerprint,synced_at) VALUES(${literal(identity.id)},${literal(fingerprint)},strftime('%Y-%m-%dT%H:%M:%fZ','now'))
ON CONFLICT(user_id) DO UPDATE SET credential_fingerprint=excluded.credential_fingerprint,synced_at=excluded.synced_at WHERE staging_auth_identities.credential_fingerprint<>excluded.credential_fingerprint;`;
  }
  return sql + '\nDROP TABLE staging_identity_sync_guard;';
}

export async function createStagingCredentialSecret(raw) {
  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    throw new Error('Credential input is invalid.');
  }
  if (
    !input ||
    !Array.isArray(input.identities) ||
    input.identities.length !== 3 ||
    Object.keys(input).some((key) => key !== 'identities')
  ) {
    throw new Error('Provide exactly three staging identities.');
  }
  const source = input.identities.map((identity) => {
    if (
      !identity ||
      !stagingRoles.includes(identity.role) ||
      !validStagingPassword(identity.password) ||
      Object.keys(identity).some(
        (key) => !['role', 'email', 'password'].includes(key),
      )
    ) {
      throw new Error('Credential input is invalid.');
    }
    return {
      role: identity.role,
      email: stagingEmail(identity.email),
      password: identity.password,
    };
  });
  if (
    new Set(source.map((entry) => entry.role)).size !== 3 ||
    new Set(source.map((entry) => entry.email)).size !== 3
  ) {
    throw new Error('Credential roles and emails must be distinct.');
  }
  const identities = [];
  for (const identity of source) {
    identities.push({
      role: identity.role,
      email: identity.email,
      verifier: await createStagingVerifier(identity.password),
    });
  }
  const secret = JSON.stringify({ version: 1, identities });
  parseStagingCredentials(secret);
  return secret;
}
