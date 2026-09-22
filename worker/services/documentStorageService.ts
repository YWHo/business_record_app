import { HttpError } from '../lib/http';
import type { Env } from '../types';

export function requireDocumentStorage(env: Env): R2Bucket {
  if (env.APP_ENV === 'demo') {
    throw new HttpError(404, 'Document storage is unavailable in the demo.');
  }
  if (!env.DOCUMENTS) {
    throw new HttpError(503, 'Document storage is unavailable.');
  }
  return env.DOCUMENTS;
}
