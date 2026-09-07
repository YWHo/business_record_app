import { json } from '../lib/http';
import type { Env } from '../types';

export async function health(env: Env): Promise<Response> {
  const metadata = await env.DB.prepare(
    "SELECT value FROM runtime_metadata WHERE key = 'schema_phase'",
  ).first<{ value: string }>();

  return json({
    status: 'ok',
    environment: env.APP_ENV,
    database: metadata ? 'ready' : 'unseeded',
    schemaPhase: metadata?.value ?? null,
  });
}
