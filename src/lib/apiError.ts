export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: Record<string, unknown> | null,
  ) {
    super(
      typeof body?.error === 'string'
        ? body.error
        : 'The request could not be completed.',
    );
  }
}
