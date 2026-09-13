import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../types';
import { deliverEmail, type EmailMessage } from './emailService';

const message: EmailMessage = {
  to: 'person@example.invalid',
  subject: 'Security notice',
  text: 'Message body',
  actionUrl: 'https://records.example.invalid/action',
};

const environment = (overrides: Partial<Env> = {}) =>
  ({
    APP_ENV: 'production',
    EMAIL_DELIVERY_URL: 'https://relay.example.invalid/send',
    EMAIL_DELIVERY_BEARER_TOKEN: 'relay-secret',
    EMAIL_FROM: 'records@example.invalid',
    ...overrides,
  }) as Env;

afterEach(() => vi.unstubAllGlobals());

describe('email delivery boundary', () => {
  it('refuses to send its bearer secret over plaintext HTTP', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      deliverEmail(
        environment({ EMAIL_DELIVERY_URL: 'http://relay.example.invalid' }),
        message,
      ),
    ).rejects.toMatchObject({ status: 503 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('turns relay network failures into a bounded service error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('offline'))),
    );

    await expect(deliverEmail(environment(), message)).rejects.toMatchObject({
      status: 503,
      message: 'Email delivery is temporarily unavailable.',
    });
  });

  it('sends only to the configured relay rather than a message URL', async () => {
    const fetchMock = vi.fn<typeof fetch>(() =>
      Promise.resolve(new Response(null, { status: 202 })),
    );
    vi.stubGlobal('fetch', fetchMock);

    await deliverEmail(environment(), {
      ...message,
      actionUrl: 'https://attacker.example.invalid/proxy-target',
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith(
      new URL('https://relay.example.invalid/send'),
      expect.objectContaining({ method: 'POST' }),
    );
  });
});
