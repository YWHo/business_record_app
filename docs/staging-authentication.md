# Staging password authentication

Phase 4 implements password sign-in for the three disposable staging identities.
It does not deploy, create resources, install secrets or enable staging on the
production server. Complete the Phase 5 operational review before deployment.

For an existing local development checkout, apply migration 0011 with
`pnpm db:migrate:local` before running the updated app. The shared session schema
is also used by local sign-in. This preserves records and requires no reseed or
reset; an unmigrated database cannot create or read the updated sessions.

## Configuration and identity lifecycle

The Worker secret `STAGING_AUTH_CREDENTIALS` contains a versioned JSON object:
`{ "version": 1, "identities": [{ "role", "email", "verifier" }, ...] }`.
Exactly one OWNER, ACCOUNTANT and AUDITOR are required, with distinct normalized
emails and salts. Unknown fields, malformed verifiers and alternative hashing
parameters fail closed. Never put this secret in a frontend environment variable,
repository file, shell argument, log or browser storage.

Generate it using `node scripts/create-staging-credentials.mjs`. Feed JSON through
stdin with exactly three entries shaped `{ "role", "email", "password" }` under
`identities`. Passwords must contain 16–128 UTF-8 bytes; use independently generated
strong passwords. The tool derives random salted verifiers sequentially, never
serializes plaintext passwords, and writes only the resulting secret JSON to
stdout. It refuses interactive terminal input/output and unexpected arguments.
Pipe input from a protected password manager and output to a protected secret
manager; do not redirect either into the checkout. The resulting JSON is still
sensitive because it permits offline password guessing.

When remote setup is explicitly authorized, install that JSON as the staging-only
Worker secret and retain it in the operator's secret manager for synchronization.
The installation target is `wrangler secret put STAGING_AUTH_CREDENTIALS --env
staging`; it is a separate remote action. Configure the staging Turnstile site key
and backend secret too. No real credentials or Turnstile keys are checked in.

Provision the guarded synthetic fixture first, then synchronize the configured
emails and credential fingerprints. `pnpm staging:sync` only prints a plan and
does not read credentials or call Wrangler. Applying requires all the same
resource and confirmation checks as provisioning:

```sh
pnpm staging:sync --apply --confirm business-records-staging --database-id STAGING_D1_UUID
```

For apply, supply the secret JSON through stdin or the process-only
`STAGING_AUTH_CREDENTIALS` environment variable. Clear that variable afterward.
The tool strips it from Wrangler's child environment. It verifies the remote
database name and UUID, applies additive migrations, requires the recognized
staging fixture, and only updates the three fixed user emails and fingerprints.
It cannot create users, change roles, activate disabled memberships, restore
scopes, extend Auditor expiry, send email or write R2 objects. SQL and output
contain no passwords or password verifiers. Sync can run with existing attachment
metadata because it does not reset financial records or evidence references.

Repeated sync with unchanged credentials preserves sessions and identity rows.
Changing an email or verifier immediately makes that identity's old sessions
unusable once the new Worker secret is effective. Sync then removes those session
rows and enables login with the new credentials. Other identities retain their
sessions if their entries are unchanged. For a single-identity rotation, retain
the other two existing verifier entries; regenerating all three rotates all three.
Keep the secret-manager copy and deployed JSON consistent; an intermediate
mismatch fails closed. Logout deletes the current session normally.

A deliberate staging reset clears sessions and fingerprint bindings, renews the
fixture's Auditor membership and requires sync again before login. Login and
ordinary sync never renew expired access. An owner must explicitly administer
access, or the operator must intentionally reset the disposable fixture. Existing
reset safeguards still refuse attachment metadata and never touch R2.

## Login and session defenses

`POST /api/auth/staging-login` checks `APP_ENV=staging` before reading input,
verifying a password, accessing D1 or issuing cookies. Local, legacy demo and
production return 404 even if staging secrets are accidentally configured.
Staging rejects passwordless email login/verification and the local shortcuts.
Production's owner bootstrap, invitations and passwordless flow remain intact.

The staging form accepts email and password, requires a challenge token, clears
the password after every attempt and remounts the challenge for a retry. There is
no role chooser for private staging login. Static `/demo` remains independent.
The backend requires the exact configured Origin, JSON input capped at 4096
actual bytes, fixed credential fields, a valid Turnstile response for the login
action/hostname, entry IP limits and a separate five-attempts-per-minute limiter
for IP and hashed normalized email. Missing limiter/configuration fails closed.
Unknown emails and wrong passwords return the same generic failure and perform
the same bounded password derivation. Throttling is temporary and never changes
membership status or creates a permanent account lockout.

The configured role must match the existing user and membership. Fresh status,
account, scope and expiry checks run before session creation and on protected
requests. Sessions store only the random token hash and a SHA-256 credential
fingerprint; D1 does not contain password verifiers. Cookies are HTTP-only,
SameSite=Strict, Secure on HTTPS and expire after eight hours. Production rejects
sessions marked as staging credentials. No credential fields are returned by
the login or current-user APIs.

## Password hashing and Worker limits

Verification uses native `node:crypto` scrypt and timing-safe comparison, enabled
by `nodejs_compat`. Parameters are fixed at N=32768, r=8, p=3, a random 16-byte
salt and a 32-byte output. This is an OWASP-listed scrypt configuration with an
approximately 32 MiB working set; native allocation is capped at 64 MiB. Only one
password verification runs concurrently per Worker isolate; a busy isolate returns
a temporary 503. Origin, request bounds, rate limits and Turnstile precede hashing.
See [OWASP password storage guidance](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
and [Workers Node crypto support](https://developers.cloudflare.com/workers/runtime-apis/nodejs/crypto/).

`pnpm staging:benchmark` exercises the same module inside local workerd using
synthetic credentials in memory. Five successful verification requests measured
143–164 ms wall time on this Windows development machine. These measurements are
not deployed CPU telemetry. Staging sets an explicit 1000 ms CPU request budget
and requires a paid Workers plan: the free plan's 10 ms CPU allowance is unsuitable.
No paid plan was enabled or changed. Before deployment, review the plan and cost
controls explicitly, then verify hosted CPU/memory telemetry and throttling under
the intended workload. See [Workers limits](https://developers.cloudflare.com/workers/platform/limits/).

## Verification

SQLite integration tests exercise real scrypt login for all three roles, current
user authorization, disabled/revoked/expired/scope-limited access, credential
rotation, sync idempotency, logout, missing configuration and request defenses.
Browser tests exercise the actual form and session-refresh routing with API and
external-challenge fixtures, including failed-attempt password clearing and a
fresh challenge on retry. They complement the real backend integration tests.
Reusable form stories cover ready, waiting, rejected credentials and phone states.
