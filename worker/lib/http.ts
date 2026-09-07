export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export function json(data: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set('content-type', 'application/json; charset=utf-8');
  headers.set('cache-control', 'no-store');

  return new Response(JSON.stringify(data), { ...init, headers });
}

export async function readJsonObject(
  request: Request,
): Promise<Record<string, unknown>> {
  const contentLength = Number(request.headers.get('content-length') ?? 0);

  if (contentLength > 16_384) {
    throw new HttpError(413, 'Request body is too large.');
  }

  const body = await request.text();

  if (body.length > 16_384) {
    throw new HttpError(413, 'Request body is too large.');
  }

  try {
    const value: unknown = JSON.parse(body);

    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('Expected an object.');
    }

    return value as Record<string, unknown>;
  } catch {
    throw new HttpError(400, 'Request body must be a JSON object.');
  }
}

export function getRequiredString(
  input: Record<string, unknown>,
  field: string,
): string {
  const value = input[field];

  if (typeof value !== 'string' || value.trim() === '') {
    throw new HttpError(400, `${field} is required.`);
  }

  return value.trim();
}

export function methodNotAllowed(allowed: string[]): Response {
  return json(
    { error: 'Method not allowed.' },
    { status: 405, headers: { allow: allowed.join(', ') } },
  );
}
