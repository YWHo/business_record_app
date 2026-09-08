import { HttpError } from '../lib/http';

export interface WorkSessionValues {
  businessActivityId: string;
  vehicleId: string;
  startedAt: string;
  endedAt: string;
  odometerStartKm: number;
  odometerEndKm: number;
  grossRevenueMinor: number | null;
  currency: string;
  notes: string | null;
}

export interface WorkSessionMetrics {
  durationMinutes: number;
  durationHours: number;
  distanceKm: number;
  revenuePerHourMinor: number | null;
  revenuePerKmMinor: number | null;
}

function has(input: Record<string, unknown>, field: string): boolean {
  return Object.prototype.hasOwnProperty.call(input, field);
}

function requiredId(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim() === '' || value.length > 100) {
    throw new HttpError(400, `${label} is required.`);
  }
  return value.trim();
}

function instant(value: unknown, label: string): string {
  if (typeof value !== 'string') {
    throw new HttpError(
      400,
      `${label} must include a date, time, and timezone.`,
    );
  }
  const parts = value.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/,
  );
  if (!parts) {
    throw new HttpError(
      400,
      `${label} must include a date, time, and timezone.`,
    );
  }
  const [, yearText, monthText, dayText, hourText, minuteText, secondText] =
    parts;
  const [year, month, day, hour, minute, second] = [
    yearText,
    monthText,
    dayText,
    hourText,
    minuteText,
    secondText ?? '0',
  ].map(Number);
  const calendarCheck = new Date(
    Date.UTC(year, month - 1, day, hour, minute, second),
  );
  if (
    calendarCheck.getUTCFullYear() !== year ||
    calendarCheck.getUTCMonth() !== month - 1 ||
    calendarCheck.getUTCDate() !== day ||
    calendarCheck.getUTCHours() !== hour ||
    calendarCheck.getUTCMinutes() !== minute ||
    calendarCheck.getUTCSeconds() !== second
  ) {
    throw new HttpError(400, `${label} must be a valid date and time.`);
  }
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    throw new HttpError(400, `${label} must be a valid date and time.`);
  }
  return new Date(timestamp).toISOString();
}

function kilometres(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new HttpError(400, `${label} must be a non-negative number.`);
  }
  if (value > 10_000_000) {
    throw new HttpError(400, `${label} is outside the supported range.`);
  }
  return Math.round(value * 1000) / 1000;
}

export function parseMoneyToMinor(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' && typeof value !== 'number') {
    throw new HttpError(
      400,
      'Gross revenue must be a non-negative amount with at most two decimals.',
    );
  }
  const normalized =
    typeof value === 'number' ? value.toString() : value.trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) {
    throw new HttpError(
      400,
      'Gross revenue must be a non-negative amount with at most two decimals.',
    );
  }
  const [whole, fraction = ''] = normalized.split('.');
  const minor = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(minor) || minor < 0 || minor > 100_000_000_000) {
    throw new HttpError(400, 'Gross revenue is outside the supported range.');
  }
  return minor;
}

function optionalNotes(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') {
    throw new HttpError(400, 'Notes must be text.');
  }
  const notes = value.trim();
  if (notes.length > 2000) {
    throw new HttpError(400, 'Notes must be 2000 characters or fewer.');
  }
  return notes || null;
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

export function workSessionValues(
  input: Record<string, unknown>,
  current?: WorkSessionValues,
): WorkSessionValues {
  const values: WorkSessionValues = {
    businessActivityId: has(input, 'businessActivityId')
      ? requiredId(input.businessActivityId, 'Business activity')
      : (current?.businessActivityId ?? ''),
    vehicleId: has(input, 'vehicleId')
      ? requiredId(input.vehicleId, 'Vehicle')
      : (current?.vehicleId ?? ''),
    startedAt: has(input, 'startedAt')
      ? instant(input.startedAt, 'Start time')
      : (current?.startedAt ?? ''),
    endedAt: has(input, 'endedAt')
      ? instant(input.endedAt, 'End time')
      : (current?.endedAt ?? ''),
    odometerStartKm: has(input, 'odometerStartKm')
      ? kilometres(input.odometerStartKm, 'Starting odometer')
      : (current?.odometerStartKm ?? -1),
    odometerEndKm: has(input, 'odometerEndKm')
      ? kilometres(input.odometerEndKm, 'Ending odometer')
      : (current?.odometerEndKm ?? -1),
    grossRevenueMinor: has(input, 'grossRevenue')
      ? parseMoneyToMinor(input.grossRevenue)
      : (current?.grossRevenueMinor ?? null),
    currency: has(input, 'currency')
      ? currency(input.currency)
      : (current?.currency ?? 'NZD'),
    notes: has(input, 'notes')
      ? optionalNotes(input.notes)
      : (current?.notes ?? null),
  };

  if (!values.businessActivityId || !values.vehicleId) {
    throw new HttpError(400, 'Business activity and vehicle are required.');
  }
  if (!values.startedAt || !values.endedAt) {
    throw new HttpError(400, 'Start and end times are required.');
  }
  if (values.endedAt <= values.startedAt) {
    throw new HttpError(400, 'End time must be after start time.');
  }
  if (values.odometerEndKm < values.odometerStartKm) {
    throw new HttpError(
      400,
      'Ending odometer cannot be below starting odometer.',
    );
  }
  return values;
}

export function calculateWorkSessionMetrics(
  startedAt: string,
  endedAt: string,
  generatedDistanceKm: number,
  grossRevenueMinor: number | null,
): WorkSessionMetrics {
  const durationMinutes = Math.round(
    (Date.parse(endedAt) - Date.parse(startedAt)) / 60_000,
  );
  const distanceKm = Math.round(generatedDistanceKm * 1000) / 1000;
  const durationHours = Math.round((durationMinutes / 60) * 100) / 100;
  return {
    durationMinutes,
    durationHours,
    distanceKm,
    revenuePerHourMinor:
      grossRevenueMinor === null || durationMinutes <= 0
        ? null
        : Math.round((grossRevenueMinor * 60) / durationMinutes),
    revenuePerKmMinor:
      grossRevenueMinor === null || distanceKm <= 0
        ? null
        : Math.round(grossRevenueMinor / distanceKm),
  };
}

export function calculateRetentionDate(
  occurredAt: string,
  taxYears: number,
  yearEndMonth: number,
  yearEndDay: number,
  timeZone = 'Pacific/Auckland',
): string {
  const occurred = new Date(occurredAt);
  const parts = new Intl.DateTimeFormat('en-NZ', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(occurred);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((candidate) => candidate.type === type)?.value ?? '';
  const localYear = Number(part('year'));
  const localDate = `${part('year')}-${part('month')}-${part('day')}`;
  const yearEnd = `${localYear}-${String(yearEndMonth).padStart(2, '0')}-${String(yearEndDay).padStart(2, '0')}`;
  const taxYearEndYear = localDate <= yearEnd ? localYear : localYear + 1;
  return `${taxYearEndYear + taxYears}-${String(yearEndMonth).padStart(2, '0')}-${String(yearEndDay).padStart(2, '0')}`;
}
