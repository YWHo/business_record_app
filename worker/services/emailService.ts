import { HttpError } from '../lib/http';
import type { Env } from '../types';

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  actionUrl: string;
}

export async function deliverEmail(
  env: Env,
  message: EmailMessage,
): Promise<void> {
  if (env.APP_ENV === 'local') {
    await env.DB.prepare(
      `INSERT INTO development_auth_outbox
        (id, recipient_email, subject, action_url, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
      .bind(
        crypto.randomUUID(),
        message.to,
        message.subject,
        message.actionUrl,
        new Date().toISOString(),
      )
      .run();
    return;
  }

  if (!env.EMAIL_DELIVERY_URL || !env.EMAIL_DELIVERY_BEARER_TOKEN) {
    throw new HttpError(503, 'Email delivery is not configured.');
  }

  const response = await fetch(env.EMAIL_DELIVERY_URL, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.EMAIL_DELIVERY_BEARER_TOKEN}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: message.to,
      subject: message.subject,
      text: message.text,
    }),
  });

  if (!response.ok) {
    throw new HttpError(503, 'Email delivery is temporarily unavailable.');
  }
}
