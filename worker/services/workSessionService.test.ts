import { describe, expect, it } from 'vitest';
import { HttpError } from '../lib/http';
import {
  calculateRetentionDate,
  calculateWorkSessionMetrics,
  parseMoneyToMinor,
  workSessionValues,
} from './workSessionService';

describe('work session calculations', () => {
  it('derives distance and revenue rates', () => {
    expect(
      calculateWorkSessionMetrics(
        '2026-09-08T00:00:00.000Z',
        '2026-09-08T02:30:00.000Z',
        75,
        15_000,
      ),
    ).toEqual({
      durationMinutes: 150,
      durationHours: 2.5,
      distanceKm: 75,
      revenuePerHourMinor: 6000,
      revenuePerKmMinor: 200,
    });
  });

  it('does not claim a revenue-per-km result for zero distance', () => {
    expect(
      calculateWorkSessionMetrics(
        '2026-09-08T00:00:00.000Z',
        '2026-09-08T01:00:00.000Z',
        0,
        5000,
      ).revenuePerKmMinor,
    ).toBeNull();
  });

  it('converts decimal currency without storing floating point money', () => {
    expect(parseMoneyToMinor('123.45')).toBe(12_345);
    expect(parseMoneyToMinor('8.5')).toBe(850);
  });

  it('rejects reversed odometers and times', () => {
    expect(() =>
      workSessionValues({
        businessActivityId: 'activity',
        vehicleId: 'vehicle',
        startedAt: '2026-09-08T02:00:00.000Z',
        endedAt: '2026-09-08T01:00:00.000Z',
        odometerStartKm: 200,
        odometerEndKm: 100,
      }),
    ).toThrow(HttpError);
  });

  it('rejects impossible calendar timestamps', () => {
    expect(() =>
      workSessionValues({
        businessActivityId: 'activity',
        vehicleId: 'vehicle',
        startedAt: '2026-02-30T01:00:00.000Z',
        endedAt: '2026-03-01T02:00:00.000Z',
        odometerStartKm: 100,
        odometerEndKm: 120,
      }),
    ).toThrow(HttpError);
  });

  it('uses the configured tax-year end for retention', () => {
    expect(calculateRetentionDate('2026-04-01T00:00:00.000Z', 10, 3, 31)).toBe(
      '2037-03-31',
    );
    expect(calculateRetentionDate('2026-03-30T00:00:00.000Z', 10, 3, 31)).toBe(
      '2036-03-31',
    );
    expect(calculateRetentionDate('2026-03-31T10:59:00.000Z', 10, 3, 31)).toBe(
      '2036-03-31',
    );
    expect(calculateRetentionDate('2026-03-31T11:00:00.000Z', 10, 3, 31)).toBe(
      '2037-03-31',
    );
  });
});
