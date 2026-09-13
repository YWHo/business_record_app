import { describe, expect, it } from 'vitest';
import type { Env } from '../types';
import { uploadAttachment } from './attachments';
import { downloadExport } from './exports';
import { purgeFromTrash } from './governance';

const demo = { APP_ENV: 'demo' } as Env;

describe('public demo expensive-operation boundary', () => {
  it('rejects binary uploads server-side and consumes the request body', async () => {
    const request = new Request(
      'https://demo.example.invalid/api/attachments',
      {
        method: 'POST',
        body: 'untrusted file bytes',
      },
    );

    await expect(uploadAttachment(request, demo)).rejects.toMatchObject({
      status: 403,
      message: 'Document uploads are unavailable in the public demo.',
    });
    expect(request.bodyUsed).toBe(true);
  });

  it('rejects dynamic archives before authentication or data reads', async () => {
    await expect(
      downloadExport(
        new Request('https://demo.example.invalid/api/exports/archive'),
        demo,
      ),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('rejects permanent deletion before authentication or data writes', async () => {
    await expect(
      purgeFromTrash(
        new Request('https://demo.example.invalid/api/trash', {
          method: 'DELETE',
        }),
        demo,
      ),
    ).rejects.toMatchObject({ status: 403 });
  });
});
