import { createStagingCredentialSecret } from './staging-identities.mjs';
if (process.argv.length !== 2 || process.stdin.isTTY || process.stdout.isTTY) {
  throw new Error(
    'Supply credential JSON on stdin. Do not put passwords in command arguments.',
  );
}
let input = '';
process.stdin.setEncoding('utf8');
for await (const chunk of process.stdin) {
  input += chunk;
  if (Buffer.byteLength(input) > 8192) {
    throw new Error('Credential input is too large.');
  }
}
// Intended for a secret-manager pipe. No plaintext password is printed or saved.
process.stdout.write(await createStagingCredentialSecret(input));
