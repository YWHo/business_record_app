import { describe, expect, it } from 'vitest';
import { HttpError } from '../lib/http';
import { activityValues, vehicleValues } from './referenceDataService';

describe('activityValues', () => {
  it('normalizes a new activity', () => {
    expect(
      activityValues({
        name: '  Design consulting ',
        activityType: 'professional_services',
        startedAt: '2026-04-01',
      }),
    ).toEqual({
      name: 'Design consulting',
      activityType: 'PROFESSIONAL_SERVICES',
      active: true,
      startedAt: '2026-04-01',
      endedAt: null,
    });
  });

  it('clears the end date when an activity is reactivated', () => {
    const current = {
      name: 'Consulting',
      activityType: 'SERVICES',
      active: false,
      startedAt: '2025-01-01',
      endedAt: '2025-12-31',
    };
    expect(activityValues({ active: true }, current).endedAt).toBeNull();
  });

  it('rejects an impossible date range', () => {
    expect(() =>
      activityValues({
        name: 'Consulting',
        activityType: 'SERVICES',
        active: false,
        startedAt: '2026-04-02',
        endedAt: '2026-04-01',
      }),
    ).toThrow(HttpError);
  });
});

describe('vehicleValues', () => {
  it('normalizes registration and optional notes', () => {
    expect(
      vehicleValues({
        registration: ' abc-123 ',
        description: ' Work hatchback ',
        acquiredAt: '2026-01-20',
        notes: '  ',
      }),
    ).toEqual({
      registration: 'ABC-123',
      description: 'Work hatchback',
      active: true,
      acquiredAt: '2026-01-20',
      retiredAt: null,
      notes: null,
    });
  });

  it('rejects invalid calendar dates', () => {
    expect(() =>
      vehicleValues({
        registration: 'ABC123',
        description: 'Work vehicle',
        acquiredAt: '2026-02-30',
      }),
    ).toThrow(HttpError);
  });
});
