// Test-only child process: verify large SQL reaches argv intact, without running it.
import { createHash } from 'node:crypto';
const value = process.argv.at(-2);
process.stdout.write(
  JSON.stringify({
    bytes: Buffer.byteLength(value),
    hash: createHash('sha256').update(value).digest('hex'),
  }),
);
