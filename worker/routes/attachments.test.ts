import { describe, expect, it, vi } from 'vitest';
import type { Env } from '../types';
import { uploadAttachment } from './attachments';

describe('attachment route boundary', () => {
  it('rejects an unauthenticated upload without buffering its body', async () => {
    const request = new Request(
      'https://records.example.invalid/api/attachments',
      { method: 'POST', body: 'untrusted upload bytes' },
    );
    const bodyRead = vi.spyOn(request, 'arrayBuffer');

    await expect(uploadAttachment(request, {} as Env)).rejects.toMatchObject({
      status: 401,
    });
    expect(bodyRead).not.toHaveBeenCalled();
    expect(request.bodyUsed).toBe(true);
  });
});
