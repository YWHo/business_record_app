import { HttpError } from '../lib/http';
import { parseInstant } from './fuelService';

export type GstStatus =
  'UNKNOWN' | 'GST_INCLUDED' | 'NO_GST' | 'REVIEW_REQUIRED';
export type RecurrenceType = 'ONE_OFF' | 'RECURRING';

export interface CommonExpenseValues {
  businessActivityId: string | null;
  expenseCategoryId: string;
  merchantName: string;
  purchaseDatetime: string;
  totalAmountMinor: number;
  currency: string;
  gstAmountMinor: number | null;
  gstStatus: GstStatus;
  description: string | null;
  recurrenceType: RecurrenceType;
}

export interface ParkingValues extends CommonExpenseValues {
  vehicleId: string | null;
  parkingProvider: string | null;
  parkingLocation: string;
  parkingStartDatetime: string | null;
  parkingEndDatetime: string | null;
  parkingReference: string | null;
}

function has(input: Record<string, unknown>, field: string) {
  return Object.prototype.hasOwnProperty.call(input, field);
}

export function expenseText(
  value: unknown,
  label: string,
  maximum: number,
  required = false,
): string | null {
  if (value === undefined || value === null || value === '') {
    if (required) throw new HttpError(400, `${label} is required.`);
    return null;
  }
  if (typeof value !== 'string')
    throw new HttpError(400, `${label} must be text.`);
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

export function expenseId(
  value: unknown,
  label: string,
  required = false,
): string | null {
  const id = expenseText(value, label, 100, required);
  return id;
}

export function moneyToMinor(
  value: unknown,
  label: string,
  nullable = false,
): number | null {
  if (value === undefined || value === null || value === '') {
    if (nullable) return null;
    throw new HttpError(400, `${label} is required.`);
  }
  if (typeof value !== 'string' && typeof value !== 'number') {
    throw new HttpError(
      400,
      `${label} must be a non-negative amount with at most two decimals.`,
    );
  }
  const normalized = String(value).trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) {
    throw new HttpError(
      400,
      `${label} must be a non-negative amount with at most two decimals.`,
    );
  }
  const [whole, fraction = ''] = normalized.split('.');
  const result = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(result) || result > 100_000_000_000) {
    throw new HttpError(400, `${label} is outside the supported range.`);
  }
  return result;
}

function choice<T extends string>(
  value: unknown,
  label: string,
  choices: readonly T[],
): T {
  if (typeof value !== 'string' || !choices.includes(value as T)) {
    throw new HttpError(400, `${label} is invalid.`);
  }
  return value as T;
}

function optionalInstant(value: unknown, label: string): string | null {
  if (value === undefined || value === null || value === '') return null;
  return parseInstant(value, label);
}

export function commonExpenseValues(
  input: Record<string, unknown>,
  current?: CommonExpenseValues,
): CommonExpenseValues {
  const totalAmountMinor = has(input, 'totalAmount')
    ? moneyToMinor(input.totalAmount, 'Total amount')!
    : (current?.totalAmountMinor ?? -1);
  if (totalAmountMinor < 0)
    throw new HttpError(400, 'Total amount is required.');
  const gstAmountMinor = has(input, 'gstAmount')
    ? moneyToMinor(input.gstAmount, 'GST amount', true)
    : (current?.gstAmountMinor ?? null);
  if (gstAmountMinor !== null && gstAmountMinor > totalAmountMinor) {
    throw new HttpError(400, 'GST amount cannot exceed the total amount.');
  }
  const currencyValue = has(input, 'currency')
    ? input.currency
    : (current?.currency ?? 'NZD');
  if (
    typeof currencyValue !== 'string' ||
    !/^[A-Za-z]{3}$/.test(currencyValue.trim())
  ) {
    throw new HttpError(400, 'Currency must be a three-letter code.');
  }
  return {
    businessActivityId: has(input, 'businessActivityId')
      ? expenseId(input.businessActivityId, 'Business activity')
      : (current?.businessActivityId ?? null),
    expenseCategoryId: has(input, 'expenseCategoryId')
      ? expenseId(input.expenseCategoryId, 'Expense category', true)!
      : (current?.expenseCategoryId ??
        expenseId(undefined, 'Expense category', true)!),
    merchantName: has(input, 'merchantName')
      ? expenseText(input.merchantName, 'Merchant', 200, true)!
      : (current?.merchantName ??
        expenseText(undefined, 'Merchant', 200, true)!),
    purchaseDatetime: has(input, 'purchaseDatetime')
      ? parseInstant(input.purchaseDatetime, 'Purchase time')
      : (current?.purchaseDatetime ?? parseInstant(undefined, 'Purchase time')),
    totalAmountMinor,
    currency: currencyValue.trim().toUpperCase(),
    gstAmountMinor,
    gstStatus: has(input, 'gstStatus')
      ? choice(input.gstStatus, 'GST status', [
          'UNKNOWN',
          'GST_INCLUDED',
          'NO_GST',
          'REVIEW_REQUIRED',
        ])
      : (current?.gstStatus ?? 'UNKNOWN'),
    description: has(input, 'description')
      ? expenseText(input.description, 'Description', 2000)
      : (current?.description ?? null),
    recurrenceType: has(input, 'recurrenceType')
      ? choice(input.recurrenceType, 'Recurrence', ['ONE_OFF', 'RECURRING'])
      : (current?.recurrenceType ?? 'ONE_OFF'),
  };
}

export function parkingValues(
  input: Record<string, unknown>,
  parkingCategoryId: string,
  current?: ParkingValues,
): ParkingValues {
  const common = commonExpenseValues(
    { ...input, expenseCategoryId: parkingCategoryId },
    current,
  );
  const started = has(input, 'parkingStartDatetime')
    ? optionalInstant(input.parkingStartDatetime, 'Parking start time')
    : (current?.parkingStartDatetime ?? null);
  const ended = has(input, 'parkingEndDatetime')
    ? optionalInstant(input.parkingEndDatetime, 'Parking end time')
    : (current?.parkingEndDatetime ?? null);
  if (started && ended && ended < started) {
    throw new HttpError(400, 'Parking end time cannot be before start time.');
  }
  return {
    ...common,
    vehicleId: has(input, 'vehicleId')
      ? expenseId(input.vehicleId, 'Vehicle')
      : (current?.vehicleId ?? null),
    parkingProvider: has(input, 'parkingProvider')
      ? expenseText(input.parkingProvider, 'Parking provider', 200)
      : (current?.parkingProvider ?? null),
    parkingLocation: has(input, 'parkingLocation')
      ? expenseText(input.parkingLocation, 'Parking location', 500, true)!
      : (current?.parkingLocation ??
        expenseText(undefined, 'Parking location', 500, true)!),
    parkingStartDatetime: started,
    parkingEndDatetime: ended,
    parkingReference: has(input, 'parkingReference')
      ? expenseText(input.parkingReference, 'Parking reference', 200)
      : (current?.parkingReference ?? null),
  };
}

export function parkingDurationMinutes(
  start: string | null,
  end: string | null,
): number | null {
  return start && end
    ? Math.round((Date.parse(end) - Date.parse(start)) / 60_000)
    : null;
}
