import { HttpError } from '../lib/http';

export type RetainedRecordType = 'EXPENSE' | 'INCOME' | 'WORK_SESSION';

export function retainedRecordType(value: unknown): RetainedRecordType {
  if (
    typeof value !== 'string' ||
    !['EXPENSE', 'INCOME', 'WORK_SESSION'].includes(value)
  )
    throw new HttpError(400, 'Record type is invalid.');
  return value as RetainedRecordType;
}

export function isPurgeEligible(
  purgeEligibleAt: string,
  now = new Date(),
): boolean {
  const boundary = Date.parse(
    /^\d{4}-\d{2}-\d{2}$/.test(purgeEligibleAt)
      ? `${purgeEligibleAt}T23:59:59.999Z`
      : purgeEligibleAt,
  );
  return Number.isFinite(boundary) && boundary <= now.valueOf();
}

export function retentionSettingsValues(input: Record<string, unknown>) {
  const integer = (field: string, min: number, max: number) => {
    const value = input[field];
    if (
      typeof value !== 'number' ||
      !Number.isInteger(value) ||
      value < min ||
      value > max
    )
      throw new HttpError(400, `${field} is invalid.`);
    return value;
  };
  const retentionTaxYears = integer('retentionTaxYears', 7, 100);
  const taxYearEndMonth = integer('taxYearEndMonth', 1, 12);
  const taxYearEndDay = integer('taxYearEndDay', 1, 31);
  const backupReminderDays = integer('backupReminderDays', 1, 366);
  const calendar = new Date(Date.UTC(2023, taxYearEndMonth - 1, taxYearEndDay));
  if (
    calendar.getUTCMonth() !== taxYearEndMonth - 1 ||
    calendar.getUTCDate() !== taxYearEndDay
  )
    throw new HttpError(400, 'Tax year end must be a valid calendar date.');
  return {
    retentionTaxYears,
    taxYearEndMonth,
    taxYearEndDay,
    backupReminderDays,
  };
}
