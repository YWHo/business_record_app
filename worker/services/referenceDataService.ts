import { HttpError } from '../lib/http';

const activityTypePattern = /^[A-Z][A-Z0-9_]{0,49}$/;
const registrationPattern = /^[A-Z0-9][A-Z0-9 -]{0,15}$/;

export interface ActivityValues {
  name: string;
  activityType: string;
  active: boolean;
  startedAt: string | null;
  endedAt: string | null;
}

export interface VehicleValues {
  registration: string;
  description: string;
  active: boolean;
  acquiredAt: string | null;
  retiredAt: string | null;
  notes: string | null;
}

function has(input: Record<string, unknown>, field: string): boolean {
  return Object.prototype.hasOwnProperty.call(input, field);
}

function requiredText(
  value: unknown,
  label: string,
  maximumLength: number,
): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new HttpError(400, `${label} is required.`);
  }

  const normalized = value.trim();
  if (normalized.length > maximumLength) {
    throw new HttpError(
      400,
      `${label} must be ${maximumLength} characters or fewer.`,
    );
  }
  return normalized;
}

function optionalText(
  value: unknown,
  label: string,
  maximumLength: number,
): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') {
    throw new HttpError(400, `${label} must be text.`);
  }
  const normalized = value.trim();
  if (normalized.length > maximumLength) {
    throw new HttpError(
      400,
      `${label} must be ${maximumLength} characters or fewer.`,
    );
  }
  return normalized || null;
}

function dateOnly(value: unknown, label: string): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new HttpError(400, `${label} must be a valid date.`);
  }
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new HttpError(400, `${label} must be a valid date.`);
  }
  return value;
}

function booleanValue(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') {
    throw new HttpError(400, `${label} must be true or false.`);
  }
  return value;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function defaultEndDate(startedAt: string | null): string {
  const currentDate = today();
  return startedAt && startedAt > currentDate ? startedAt : currentDate;
}

export function activityValues(
  input: Record<string, unknown>,
  current?: ActivityValues,
): ActivityValues {
  const name = has(input, 'name')
    ? requiredText(input.name, 'Activity name', 100)
    : current?.name;
  const rawType = has(input, 'activityType')
    ? requiredText(input.activityType, 'Activity type', 50).toUpperCase()
    : current?.activityType;
  const active = has(input, 'active')
    ? booleanValue(input.active, 'Active')
    : (current?.active ?? true);
  const startedAt = has(input, 'startedAt')
    ? dateOnly(input.startedAt, 'Start date')
    : (current?.startedAt ?? null);
  let endedAt = has(input, 'endedAt')
    ? dateOnly(input.endedAt, 'End date')
    : (current?.endedAt ?? null);

  if (!name || !rawType) {
    throw new HttpError(400, 'Activity name and type are required.');
  }
  if (!activityTypePattern.test(rawType)) {
    throw new HttpError(
      400,
      'Activity type must use uppercase letters, numbers, and underscores.',
    );
  }
  endedAt = active ? null : (endedAt ?? defaultEndDate(startedAt));
  if (startedAt && endedAt && endedAt < startedAt) {
    throw new HttpError(400, 'End date cannot be before start date.');
  }

  return { name, activityType: rawType, active, startedAt, endedAt };
}

export function vehicleValues(
  input: Record<string, unknown>,
  current?: VehicleValues,
): VehicleValues {
  const registration = has(input, 'registration')
    ? requiredText(input.registration, 'Registration', 16).toUpperCase()
    : current?.registration;
  const description = has(input, 'description')
    ? requiredText(input.description, 'Description', 200)
    : current?.description;
  const active = has(input, 'active')
    ? booleanValue(input.active, 'Active')
    : (current?.active ?? true);
  const acquiredAt = has(input, 'acquiredAt')
    ? dateOnly(input.acquiredAt, 'Acquired date')
    : (current?.acquiredAt ?? null);
  let retiredAt = has(input, 'retiredAt')
    ? dateOnly(input.retiredAt, 'Retired date')
    : (current?.retiredAt ?? null);
  const notes = has(input, 'notes')
    ? optionalText(input.notes, 'Notes', 2000)
    : (current?.notes ?? null);

  if (!registration || !description) {
    throw new HttpError(400, 'Registration and description are required.');
  }
  if (!registrationPattern.test(registration)) {
    throw new HttpError(
      400,
      'Registration may contain only letters, numbers, spaces, and hyphens.',
    );
  }
  retiredAt = active ? null : (retiredAt ?? defaultEndDate(acquiredAt));
  if (acquiredAt && retiredAt && retiredAt < acquiredAt) {
    throw new HttpError(400, 'Retired date cannot be before acquired date.');
  }

  return {
    registration,
    description,
    active,
    acquiredAt,
    retiredAt,
    notes,
  };
}
