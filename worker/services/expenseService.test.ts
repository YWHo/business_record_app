import { describe, expect, it } from 'vitest';
import {
  commonExpenseValues,
  parkingDurationMinutes,
  parkingValues,
} from './expenseService';

const common = {
  businessActivityId: 'activity-1',
  expenseCategoryId: 'category-software',
  merchantName: 'Cloud Tools',
  purchaseDatetime: '2026-09-08T10:00:00+12:00',
  totalAmount: '12.34',
  currency: 'nzd',
  gstAmount: '1.61',
  gstStatus: 'GST_INCLUDED',
  recurrenceType: 'RECURRING',
};

describe('expense validation', () => {
  it('normalizes money, currency, and recurrence', () => {
    expect(commonExpenseValues(common)).toMatchObject({
      totalAmountMinor: 1234,
      gstAmountMinor: 161,
      currency: 'NZD',
      recurrenceType: 'RECURRING',
    });
  });

  it('rejects GST above the receipt total', () => {
    expect(() =>
      commonExpenseValues({ ...common, gstAmount: '20.00' }),
    ).toThrow('GST amount cannot exceed the total amount.');
  });

  it('derives parking duration only from a complete valid interval', () => {
    const values = parkingValues(
      {
        ...common,
        parkingLocation: 'Central car park',
        parkingStartDatetime: '2026-09-08T10:00:00+12:00',
        parkingEndDatetime: '2026-09-08T11:30:00+12:00',
      },
      'category-parking',
    );
    expect(
      parkingDurationMinutes(
        values.parkingStartDatetime,
        values.parkingEndDatetime,
      ),
    ).toBe(90);
    expect(
      parkingDurationMinutes(values.parkingStartDatetime, null),
    ).toBeNull();
  });

  it('rejects a reversed parking interval', () => {
    expect(() =>
      parkingValues(
        {
          ...common,
          parkingLocation: 'Central car park',
          parkingStartDatetime: '2026-09-08T12:00:00+12:00',
          parkingEndDatetime: '2026-09-08T11:30:00+12:00',
        },
        'category-parking',
      ),
    ).toThrow('Parking end time cannot be before start time.');
  });
});
