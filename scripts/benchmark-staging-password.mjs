import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import {
  createStagingVerifier,
  stagingPasswordParameters,
} from '../shared/staging-credentials.mjs';

const require = createRequire(import.meta.url);
const miniflarePath = require.resolve('miniflare', {
  paths: [dirname(require.resolve('wrangler'))],
});
const { Miniflare, convertV4MiniflareOptions } = await import(
  pathToFileURL(miniflarePath).href
);
const password = 'fictional-benchmark-password-only';
const verifier = await createStagingVerifier(password);
const runtime = new Miniflare(
  convertV4MiniflareOptions({
    workers: [
      {
        name: 'password-benchmark',
        compatibilityDate: '2026-09-07',
        compatibilityFlags: ['nodejs_compat'],
        modules: [
          {
            type: 'ESModule',
            path: 'benchmark.js',
            contents: `import { verifyStagingPassword } from './credentials.mjs'; export default { async fetch() { const valid=await verifyStagingPassword(${JSON.stringify(password)},${JSON.stringify(verifier)}); return Response.json({valid}); } };`,
          },
          {
            type: 'ESModule',
            path: 'credentials.mjs',
            contents: readFileSync(
              new URL('../shared/staging-credentials.mjs', import.meta.url),
              'utf8',
            ),
          },
        ],
      },
    ],
  }),
);
try {
  await runtime.ready;
  const milliseconds = [];
  for (let sample = 0; sample < 5; sample += 1) {
    const start = performance.now();
    const result = await (
      await runtime.dispatchFetch('https://benchmark.invalid/')
    ).json();
    milliseconds.push(Math.round(performance.now() - start));
    if (!result.valid) {
      throw new Error('Worker password verification failed.');
    }
  }
  console.log(
    JSON.stringify(
      {
        runtime: 'local workerd',
        algorithm: 'scrypt',
        parameters: stagingPasswordParameters,
        estimatedWorkingMemoryMiB: 32,
        requestWallMilliseconds: milliseconds,
        note: 'Local wall time, not hosted CPU telemetry. No remote requests or credentials.',
      },
      null,
      2,
    ),
  );
} finally {
  await runtime.dispose();
}
