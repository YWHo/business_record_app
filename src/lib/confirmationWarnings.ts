import { ApiError } from '../features/auth/AuthContext';

export interface ConfirmationWarning {
  code: string;
  message: string;
}

export function confirmationWarnings(
  error: unknown,
): ConfirmationWarning[] | null {
  return error instanceof ApiError &&
    error.status === 409 &&
    Array.isArray(error.body?.warnings)
    ? (error.body.warnings as ConfirmationWarning[])
    : null;
}
