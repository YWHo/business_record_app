import { describe, expect, it } from 'vitest';
import { calculateFuelMetrics, fuelValues, fuelWarnings } from './fuelService';

const complete = {
  businessActivityId: 'activity-1',
  vehicleId: 'vehicle-1',
  merchantName: 'Harbour Fuel',
  purchaseDatetime: '2026-09-08T08:30:00+12:00',
  totalAmount: '100.00',
  currency: 'nzd',
  gstAmount: '13.04',
  gstStatus: 'GST_INCLUDED',
  fuelStation: 'Harbour Fuel Central',
  fuelPricePerLitre: '2.500000',
  fuelLitres: 40,
  odometerKm: 12500.5,
  fillType: 'FULL',
};

describe('fuel values and warnings', () => {
  it('normalizes complete receipt and fuel details without warnings', () => {
    const values = fuelValues(complete);
    expect(values).toMatchObject({
      totalAmountMinor: 10_000,
      fuelPriceMicrosPerLitre: 2_500_000,
      fuelLitres: 40,
      currency: 'NZD',
    });
    expect(fuelWarnings(values)).toEqual([]);
  });

  it('warns but does not reject when price or litres are omitted', () => {
    const values = fuelValues({ ...complete, fuelPricePerLitre: '' });
    expect(fuelWarnings(values).map(({ code }) => code)).toEqual([
      'INCOMPLETE_FUEL_DETAIL',
    ]);
  });

  it('uses the larger of one dollar or two percent as material mismatch', () => {
    const values = fuelValues({ ...complete, totalAmount: '120.00' });
    expect(fuelWarnings(values).map(({ code }) => code)).toEqual([
      'TOTAL_MISMATCH',
    ]);
  });

  it('rejects zero fuel price when supplied', () => {
    expect(() => fuelValues({ ...complete, fuelPricePerLitre: '0' })).toThrow(
      'Fuel price per litre must be positive.',
    );
  });
});

describe('full-tank metrics', () => {
  it('marks supported full-tank evidence exact', () => {
    expect(calculateFuelMetrics(80, 40, 10_000, true)).toEqual({
      fuelCalculationStatus: 'EXACT',
      fuelLitresUsed: 40,
      fuelCostMinor: 10_000,
      kilometresPerLitre: 2,
      fuelCostPerKmMinor: 125,
    });
  });

  it('never labels incomplete confirmations exact', () => {
    expect(calculateFuelMetrics(80, 40, 10_000, false)).toMatchObject({
      fuelCalculationStatus: 'ESTIMATE',
    });
    expect(calculateFuelMetrics(80, null, 10_000, true)).toMatchObject({
      fuelCalculationStatus: 'UNAVAILABLE',
      fuelLitresUsed: null,
    });
  });
});
