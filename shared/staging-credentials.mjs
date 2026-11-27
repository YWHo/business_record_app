import { scrypt, timingSafeEqual } from 'node:crypto';
import { Buffer } from 'node:buffer';

export const stagingPasswordParameters = Object.freeze({
  N: 32768,
  r: 8,
  p: 3,
  maxmem: 64 * 1024 * 1024,
});
export const stagingRoles = Object.freeze(['OWNER', 'ACCOUNTANT', 'AUDITOR']);
const verifierPattern = /^scrypt\$32768\$8\$3\$([0-9a-f]{32})\$([0-9a-f]{64})$/;
function invalid() {
  throw new Error('Staging credentials are missing or invalid.');
}
export function stagingEmail(value) {
  if (typeof value !== 'string' || value.length > 254) {
    invalid();
  }
  const email = value.trim().toLowerCase();
  if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(email)) {
    invalid();
  }
  return email;
}
export function validStagingPassword(value) {
  return (
    typeof value === 'string' &&
    new TextEncoder().encode(value).length >= 16 &&
    new TextEncoder().encode(value).length <= 128
  );
}
function derive(password, salt) {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 32, stagingPasswordParameters, (error, result) => {
      if (error) {
        reject(new Error('Password verification is unavailable.'));
      } else {
        resolve(result);
      }
    });
  });
}
export async function createStagingVerifier(password) {
  if (!validStagingPassword(password)) {
    throw new Error('Passwords must contain 16–128 UTF-8 bytes.');
  }
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(password, salt);
  return `scrypt$32768$8$3$${Buffer.from(salt).toString('hex')}$${Buffer.from(hash).toString('hex')}`;
}
export async function verifyStagingPassword(password, verifier) {
  const match = verifierPattern.exec(verifier);
  if (!match || !validStagingPassword(password)) {
    return false;
  }
  const derived = await derive(password, Buffer.from(match[1], 'hex'));
  return timingSafeEqual(derived, Buffer.from(match[2], 'hex'));
}
export function parseStagingCredentials(raw) {
  if (typeof raw !== 'string' || raw.length > 4096) {
    invalid();
  }
  let config;
  try {
    config = JSON.parse(raw);
  } catch {
    invalid();
  }
  if (
    !config ||
    config.version !== 1 ||
    Object.keys(config).some(
      (key) => !['version', 'identities'].includes(key),
    ) ||
    !Array.isArray(config.identities) ||
    config.identities.length !== 3
  ) {
    invalid();
  }
  const identities = config.identities.map((identity) => {
    if (
      !identity ||
      !stagingRoles.includes(identity.role) ||
      Object.keys(identity).some(
        (key) => !['role', 'email', 'verifier'].includes(key),
      ) ||
      typeof identity.verifier !== 'string' ||
      !verifierPattern.test(identity.verifier)
    ) {
      invalid();
    }
    return {
      id: `staging-${identity.role.toLowerCase()}`,
      role: identity.role,
      email: stagingEmail(identity.email),
      verifier: identity.verifier,
    };
  });
  if (
    new Set(identities.map((identity) => identity.role)).size !== 3 ||
    new Set(identities.map((identity) => identity.email)).size !== 3 ||
    new Set(
      identities.map((identity) => verifierPattern.exec(identity.verifier)[1]),
    ).size !== 3
  ) {
    invalid();
  }
  return identities;
}
export async function stagingCredentialFingerprint(identity) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(
      JSON.stringify([
        identity.id,
        identity.role,
        identity.email,
        identity.verifier,
      ]),
    ),
  );
  return Buffer.from(digest).toString('hex');
}
