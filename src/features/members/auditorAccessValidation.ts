import type { AuditorScope } from '../../lib/auditorAccess';

export function auditorAccessValidationError(
  start: string,
  expiry: string,
  scopes: AuditorScope[],
): string | null {
  if (
    !expiry ||
    !Number.isFinite(Date.parse(expiry)) ||
    Date.parse(expiry) <= Date.now() ||
    (start && Date.parse(start) >= Date.parse(expiry))
  ) {
    return 'Choose a future expiry after the access start.';
  }

  if (
    scopes.some(
      (scope) =>
        (scope.scopeType === 'BUSINESS' && !scope.businessId) ||
        (scope.scopeType === 'LEGAL_ENTITY' && !scope.legalEntityId) ||
        (scope.dateFrom && scope.dateTo && scope.dateFrom > scope.dateTo),
    )
  ) {
    return 'Select each scope and use an end date on or after its start date.';
  }

  return null;
}
