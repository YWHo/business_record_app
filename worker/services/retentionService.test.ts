import { describe, expect, it } from 'vitest';
import {
  isPurgeEligible,
  retainedRecordType,
  retentionSettingsValues,
} from './retentionService';

describe('retention controls', () => {
  it('only accepts retained business record types', () => {
    expect(retainedRecordType('EXPENSE')).toBe('EXPENSE');
    expect(() => retainedRecordType('USER')).toThrow('Record type');
  });

  it('makes a record eligible only at or after its boundary', () => {
    const now = new Date('2036-04-01T00:00:00.000Z');
    expect(isPurgeEligible('2036-03-31', now)).toBe(true);
    expect(isPurgeEligible('2036-04-01', now)).toBe(false);
    expect(isPurgeEligible('2036-04-01T00:00:00.000Z', now)).toBe(true);
    expect(isPurgeEligible('2036-04-02T00:00:00.000Z', now)).toBe(false);
  });

  it('requires a conservative valid retention policy', () => {
    expect(
      retentionSettingsValues({
        retentionTaxYears: 10,
        taxYearEndMonth: 3,
        taxYearEndDay: 31,
        backupReminderDays: 30,
      }),
    ).toMatchObject({ retentionTaxYears: 10, backupReminderDays: 30 });
    expect(() =>
      retentionSettingsValues({
        retentionTaxYears: 6,
        taxYearEndMonth: 2,
        taxYearEndDay: 30,
        backupReminderDays: 0,
      }),
    ).toThrow();
  });
});
