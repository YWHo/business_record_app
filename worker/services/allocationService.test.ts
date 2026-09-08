import { describe, expect, it } from 'vitest';
import { allocationValues } from './allocationService';

describe('insurance allocations', () => {
  it('derives a full-business allocation from the premium', () => {
    expect(
      allocationValues({ allocationMethod: '100_PERCENT_BUSINESS' }, 12_345),
    ).toMatchObject({
      percentageBasisPoints: 10_000,
      allocatedAmountMinor: 12_345,
    });
  });
  it('derives the allocated amount from a manual percentage', () => {
    expect(
      allocationValues(
        {
          allocationMethod: 'MANUAL_PERCENTAGE',
          allocationPercentage: '37.50',
        },
        20_000,
      ),
    ).toMatchObject({
      percentageBasisPoints: 3750,
      allocatedAmountMinor: 7500,
    });
  });
  it('requires dates for a kilometres-based allocation', () => {
    expect(() =>
      allocationValues(
        {
          allocationMethod: 'BUSINESS_KM_OVER_TOTAL_KM',
          allocationPercentage: 60,
        },
        10_000,
      ),
    ).toThrow('calculation period');
  });
  it('derives accountant-adjustment percentage and caps it at the premium', () => {
    expect(
      allocationValues({ allocatedAmount: '80.00' }, 20_000, true),
    ).toMatchObject({
      allocationMethod: 'ACCOUNTANT_ADJUSTMENT',
      percentageBasisPoints: 4000,
      allocatedAmountMinor: 8000,
    });
    expect(() =>
      allocationValues({ allocatedAmount: '201.00' }, 20_000, true),
    ).toThrow('cannot exceed');
  });
  it('keeps an undetermined allocation explicitly empty', () => {
    expect(
      allocationValues(
        { allocationMethod: 'UNDETERMINED', allocationPercentage: 50 },
        10_000,
      ),
    ).toMatchObject({
      percentageBasisPoints: null,
      allocatedAmountMinor: null,
    });
  });
});
