const firstArgument = globalThis.process.argv[2];
const baseUrl =
  (firstArgument === '--' ? globalThis.process.argv[3] : firstArgument) ??
  'http://127.0.0.1:5173';

async function request(path, init = {}, cookie) {
  const headers = new Headers(init.headers);

  if (cookie) {
    headers.set('cookie', cookie);
  }

  const response = await fetch(`${baseUrl}${path}`, { ...init, headers });
  const body = await response.json();
  return { response, body };
}

function expectStatus(result, expected, label) {
  if (result.response.status !== expected) {
    throw new Error(
      `${label}: expected ${expected}, received ${result.response.status}: ${JSON.stringify(result.body)}`,
    );
  }
}

async function login(email) {
  const result = await request('/api/dev/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  expectStatus(result, 200, `login ${email}`);

  const cookie = result.response.headers.get('set-cookie')?.split(';')[0];

  if (!cookie) {
    throw new Error(`login ${email}: session cookie was not returned`);
  }

  return cookie;
}

const health = await request('/api/health');
expectStatus(health, 200, 'health');

if (health.body.database !== 'ready') {
  throw new Error(
    `health: local database is not seeded: ${JSON.stringify(health.body)}`,
  );
}

const ownerCookie = await login('owner@local.test');
const ownerPermission = await request(
  '/api/dev/permissions/owner',
  {},
  ownerCookie,
);
expectStatus(ownerPermission, 200, 'owner permission');

const accountantCookie = await login('accountant@local.test');
const recordsPermission = await request(
  '/api/dev/permissions/records',
  {},
  accountantCookie,
);
expectStatus(recordsPermission, 200, 'accountant records permission');

const deniedOwnerPermission = await request(
  '/api/dev/permissions/owner',
  {},
  accountantCookie,
);
expectStatus(deniedOwnerPermission, 403, 'accountant owner permission denial');

const disabledLogin = await request('/api/dev/auth/login', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'disabled@local.test' }),
});
expectStatus(disabledLogin, 401, 'disabled account denial');

const invitation = await request(
  '/api/dev/invitations',
  {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'phase2-invitee@local.test' }),
  },
  ownerCookie,
);
expectStatus(invitation, 201, 'create invitation');

const invitationUrl = new URL(
  invitation.body.invitation.invitationUrl,
  baseUrl,
);
const token = invitationUrl.searchParams.get('token');

if (!token) {
  throw new Error('create invitation: response did not contain a token URL');
}

const acceptBody = {
  email: 'phase2-invitee@local.test',
  token,
};
const accepted = await request('/api/dev/invitations/accept', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(acceptBody),
});
expectStatus(accepted, 200, 'accept invitation');

const reused = await request('/api/dev/invitations/accept', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(acceptBody),
});
expectStatus(reused, 400, 'single-use invitation denial');

const expired = await request('/api/dev/invitations/accept', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    email: 'expired-invitee@local.test',
    token: 'expired-local-invite',
  }),
});
expectStatus(expired, 400, 'expired invitation denial');

const invitedCookie = await login('phase2-invitee@local.test');
const invitedPermission = await request(
  '/api/dev/permissions/records',
  {},
  invitedCookie,
);
expectStatus(invitedPermission, 200, 'invited accountant permission');

const storageWrite = await request(
  '/api/dev/storage-probe',
  { method: 'PUT' },
  ownerCookie,
);
expectStatus(storageWrite, 200, 'R2 write');

const storageRead = await request('/api/dev/storage-probe', {}, ownerCookie);
expectStatus(storageRead, 200, 'R2 read');

if (!storageRead.body.exists) {
  throw new Error('R2 read: probe object was not persisted');
}

globalThis.console.log(
  'Local runtime smoke test passed: D1, sessions, roles, invitations, and R2.',
);
