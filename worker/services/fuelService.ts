import { HttpError } from '../lib/http';

export const fuelWarningCodes = [
  'INCOMPLETE_FUEL_DETAIL',
  'TOTAL_MISMATCH',
] as const;

export type FuelWarningCode = (typeof fuelWarningCodes)[number];

export interface FuelWarning {
  code: FuelWarningCode;
  message: string;
}

export interface FuelValues {
  businessActivityId: string | null;
  vehicleId: string;
  merchantName: string;
  purchaseDatetime: string;
  totalAmountMinor: number;
  currency: string;
  gstAmountMinor: number | null;
  gstStatus: 'UNKNOWN' | 'GST_INCLUDED' | 'NO_GST' | 'REVIEW_REQUIRED';
  description: string | null;
  recurrenceType: 'ONE_OFF' | 'RECURRING';
  fuelStation: string | null;
  fuelPriceMicrosPerLitre: number | null;
  fuelLitres: number | null;
  odometerKm: number | null;
  fillType: 'FULL' | 'PARTIAL' | 'UNKNOWN';
  notes: string | null;
}

function has(input: Record<string, unknown>, field: string): boolean {
  return Object.prototype.hasOwnProperty.call(input, field);
}

function optionalId(value: unknown, label: string): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || value.trim().length > 100) {
    throw new HttpError(400, `${label} is invalid.`);
  }
  return value.trim() || null;
}

function requiredId(value: unknown, label: string): string {
  const id = optionalId(value, label);
  if (!id) throw new HttpError(400, `${label} is required.`);
  return id;
}

function text(
  value: unknown,
  label: string,
  maximum: number,
  required = false,
): string | null {
  if (value === undefined || value === null || value === '') {
    if (required) throw new HttpError(400, `${label} is required.`);
    return null;
  }
  if (typeof value !== 'string') {
    throw new HttpError(400, `${label} must be text.`);
  }
  const normalized = value.trim();
  if (!normalized && required)
    throw new HttpError(400, `${label} is required.`);
  if (normalized.length > maximum) {
    throw new HttpError(
      400,
      `${label} must be ${maximum} characters or fewer.`,
    );
  }
  return normalized || null;
}

export function parseInstant(value: unknown, label: string): string {
  if (typeof value !== 'string') {
    throw new HttpError(
      400,
      `${label} must include a date, time, and timezone.`,
    );
  }
  const parts = value.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/,
  );
  if (!parts || !Number.isFinite(Date.parse(value))) {
    throw new HttpError(
      400,
      `${label} must be a valid date and time with a timezone.`,
    );
  }
  const normalized = new Date(value).toISOString();
  const [, year, month, day, hour, minute, second = '0'] = parts;
  const calendar = new Date(
    Date.UTC(+year, +month - 1, +day, +hour, +minute, +second),
  );
  if (
    calendar.getUTCFullYear() !== +year ||
    calendar.getUTCMonth() !== +month - 1 ||
    calendar.getUTCDate() !== +day ||
    calendar.getUTCHours() !== +hour ||
    calendar.getUTCMinutes() !== +minute ||
    calendar.getUTCSeconds() !== +second
  ) {
    throw new HttpError(400, `${label} must be a valid date and time.`);
  }
  return normalized;
}

function decimalToInteger(
  value: unknown,
  label: string,
  decimals: number,
  nullable: boolean,
): number | null {
  if (value === undefined || value === null || value === '') {
    if (nullable) return null;
    throw new HttpError(400, `${label} is required.`);
  }
  if (typeof value !== 'string' && typeof value !== 'number') {
    throw new HttpError(400, `${label} must be a non-negative amount.`);
  }
  const normalized = String(value).trim();
  const pattern = new RegExp(`^\\d+(?:\\.\\d{1,${decimals}})?$`);
  if (!pattern.test(normalized)) {
    throw new HttpError(
      400,
      `${label} must have at most ${decimals} decimals.`,
    );
  }
  const [whole, fraction = ''] = normalized.split('.');
  const result =
    Number(whole) * 10 ** decimals + Number(fraction.padEnd(decimals, '0'));
  if (!Number.isSafeInteger(result) || result > 100_000_000_000) {
    throw new HttpError(400, `${label} is outside the supported range.`);
  }
  return result;
}

function positiveNumber(value: unknown, label: string): number | null {
  if (value === undefined || value === null || value === '') return null;
  const result = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(result) || result <= 0 || result > 10_000_000) {
    throw new HttpError(400, `${label} must be a positive number.`);
  }
  return Math.round(result * 1000) / 1000;
}

function nonNegativeNumber(value: unknown, label: string): number | null {
  if (value === undefined || value === null || value === '') return null;
  const result = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(result) || result < 0 || result > 10_000_000) {
    throw new HttpError(400, `${label} must be a non-negative number.`);
  }
  return Math.round(result * 1000) / 1000;
}

function oneOf<T extends string>(
  value: unknown,
  label: string,
  choices: readonly T[],
  fallback: T,
): T {
  const normalized = value === undefined ? fallback : value;
  if (typeof normalized !== 'string' || !choices.includes(normalized as T)) {
    throw new HttpError(400, `${label} is invalid.`);
  }
  return normalized as T;
}

function currency(value: unknown): string {
  if (value !== undefined && typeof value !== 'string') {
    throw new HttpError(400, 'Currency must be a three-letter code.');
  }
  const normalized = value === undefined ? 'NZD' : value.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalized)) {
    throw new HttpError(400, 'Currency must be a three-letter code.');
  }
  return normalized;
}

export function fuelValues(
  input: Record<string, unknown>,
  current?: FuelValues,
): FuelValues {
  const totalAmountMinor = has(input, 'totalAmount')
    ? decimalToInteger(input.totalAmount, 'Total amount', 2, false)!
    : (current?.totalAmountMinor ?? -1);
  const gstAmountMinor = has(input, 'gstAmount')
    ? decimalToInteger(input.gstAmount, 'GST amount', 2, true)
    : (current?.gstAmountMinor ?? null);
  if (gstAmountMinor !== null && gstAmountMinor > totalAmountMinor) {
    throw new HttpError(400, 'GST amount cannot exceed the total amount.');
  }

  const fuelPriceMicrosPerLitre = has(input, 'fuelPricePerLitre')
    ? decimalToInteger(input.fuelPricePerLitre, 'Fuel price per litre', 6, true)
    : (current?.fuelPriceMicrosPerLitre ?? null);
  if (fuelPriceMicrosPerLitre !== null && fuelPriceMicrosPerLitre <= 0) {
    throw new HttpError(400, 'Fuel price per litre must be positive.');
  }
  if (totalAmountMinor < 0) {
    throw new HttpError(400, 'Total amount is required.');
  }

  return {
    businessActivityId: has(input, 'businessActivityId')
      ? optionalId(input.businessActivityId, 'Business activity')
      : (current?.businessActivityId ?? null),
    vehicleId: has(input, 'vehicleId')
      ? requiredId(input.vehicleId, 'Vehicle')
      : (current?.vehicleId ?? requiredId(undefined, 'Vehicle')),
    merchantName: has(input, 'merchantName')
      ? text(input.merchantName, 'Merchant', 200, true)!
      : (current?.merchantName ?? text(undefined, 'Merchant', 200, true)!),
    purchaseDatetime: has(input, 'purchaseDatetime')
      ? parseInstant(input.purchaseDatetime, 'Purchase time')
      : (current?.purchaseDatetime ?? parseInstant(undefined, 'Purchase time')),
    totalAmountMinor,
    currency: has(input, 'currency')
      ? currency(input.currency)
      : (current?.currency ?? 'NZD'),
    gstAmountMinor,
    gstStatus: has(input, 'gstStatus')
      ? oneOf(
          input.gstStatus,
          'GST status',
          ['UNKNOWN', 'GST_INCLUDED', 'NO_GST', 'REVIEW_REQUIRED'],
          'UNKNOWN',
        )
      : (current?.gstStatus ?? 'UNKNOWN'),
    description: has(input, 'description')
      ? text(input.description, 'Description', 2000)
      : (current?.description ?? null),
    recurrenceType: has(input, 'recurrenceType')
      ? oneOf(
          input.recurrenceType,
          'Recurrence',
          ['ONE_OFF', 'RECURRING'],
          'ONE_OFF',
        )
      : (current?.recurrenceType ?? 'ONE_OFF'),
    fuelStation: has(input, 'fuelStation')
      ? text(input.fuelStation, 'Fuel station', 200)
      : (current?.fuelStation ?? null),
    fuelPriceMicrosPerLitre,
    fuelLitres: has(input, 'fuelLitres')
      ? positiveNumber(input.fuelLitres, 'Fuel litres')
      : (current?.fuelLitres ?? null),
    odometerKm: has(input, 'odometerKm')
      ? nonNegativeNumber(input.odometerKm, 'Odometer')
      : (current?.odometerKm ?? null),
    fillType: has(input, 'fillType')
      ? oneOf(
          input.fillType,
          'Fill type',
          ['FULL', 'PARTIAL', 'UNKNOWN'],
          'UNKNOWN',
        )
      : (current?.fillType ?? 'UNKNOWN'),
    notes: has(input, 'notes')
      ? text(input.notes, 'Notes', 2000)
      : (current?.notes ?? null),
  };
}

export function fuelWarnings(values: FuelValues): FuelWarning[] {
  const warnings: FuelWarning[] = [];
  if (values.fuelPriceMicrosPerLitre === null || values.fuelLitres === null) {
    warnings.push({
      code: 'INCOMPLETE_FUEL_DETAIL',
      message:
        'Fuel price and litres are optional, but leaving either blank limits fuel analytics.',
    });
  }
  if (values.fuelPriceMicrosPerLitre !== null && values.fuelLitres !== null) {
    const calculatedMinor = Math.round(
      (values.fuelPriceMicrosPerLitre * values.fuelLitres) / 10_000,
    );
    const difference = Math.abs(calculatedMinor - values.totalAmountMinor);
    const materialThreshold = Math.max(
      100,
      Math.round(values.totalAmountMinor * 0.02),
    );
    if (difference >= materialThreshold) {
      warnings.push({
        code: 'TOTAL_MISMATCH',
        message:
          'Fuel price × litres differs materially from the receipt total. Check the values before saving.',
      });
    }
  }
  return warnings;
}

export function confirmedWarningCodes(input: unknown): Set<string> {
  if (input === undefined) return new Set();
  if (!Array.isArray(input) || input.some((code) => typeof code !== 'string')) {
    throw new HttpError(
      400,
      'Confirmed warnings must be a list of warning codes.',
    );
  }
  return new Set(input as string[]);
}

export function calculateFuelMetrics(
  distanceKm: number,
  litres: number | null,
  costMinor: number | null,
  evidenceReady: boolean,
) {
  const usable =
    litres !== null && litres > 0 && costMinor !== null && distanceKm > 0;
  return {
    fuelCalculationStatus: usable
      ? evidenceReady
        ? 'EXACT'
        : 'ESTIMATE'
      : 'UNAVAILABLE',
    fuelLitresUsed: usable ? litres : null,
    fuelCostMinor: usable ? costMinor : null,
    kilometresPerLitre: usable
      ? Math.round((distanceKm / litres) * 100) / 100
      : null,
    fuelCostPerKmMinor: usable ? Math.round(costMinor / distanceKm) : null,
  } as const;
}
