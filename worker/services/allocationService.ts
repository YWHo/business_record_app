import { HttpError } from '../lib/http';
import { expenseText, moneyToMinor } from './expenseService';

export type AllocationMethod =
  | '100_PERCENT_BUSINESS'
  | 'MANUAL_PERCENTAGE'
  | 'BUSINESS_KM_OVER_TOTAL_KM'
  | 'ACCOUNTANT_ADJUSTMENT'
  | 'UNDETERMINED';

export interface AllocationValues {
  allocationMethod: AllocationMethod;
  percentageBasisPoints: number | null;
  allocatedAmountMinor: number | null;
  calculationPeriodStart: string | null;
  calculationPeriodEnd: string | null;
  notes: string | null;
}

export function allocationDate(value: unknown, label: string): string | null {
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

function percentage(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' && typeof value !== 'number') {
    throw new HttpError(
      400,
      'Allocation percentage must be between 0 and 100 with at most two decimals.',
    );
  }
  const normalized = String(value).trim();
  if (!/^\d{1,3}(?:\.\d{1,2})?$/.test(normalized)) {
    throw new HttpError(
      400,
      'Allocation percentage must be between 0 and 100 with at most two decimals.',
    );
  }
  const basisPoints = Math.round(Number(normalized) * 100);
  if (basisPoints < 0 || basisPoints > 10_000) {
    throw new HttpError(
      400,
      'Allocation percentage must be between 0 and 100.',
    );
  }
  return basisPoints;
}

export function allocationValues(
  input: Record<string, unknown>,
  premiumMinor: number,
  accountantAdjustment = false,
): AllocationValues {
  const rawMethod = accountantAdjustment
    ? 'ACCOUNTANT_ADJUSTMENT'
    : (input.allocationMethod ?? 'UNDETERMINED');
  const methods: AllocationMethod[] = [
    '100_PERCENT_BUSINESS',
    'MANUAL_PERCENTAGE',
    'BUSINESS_KM_OVER_TOTAL_KM',
    'ACCOUNTANT_ADJUSTMENT',
    'UNDETERMINED',
  ];
  if (
    typeof rawMethod !== 'string' ||
    !methods.includes(rawMethod as AllocationMethod)
  ) {
    throw new HttpError(400, 'Allocation method is invalid.');
  }
  const allocationMethod = rawMethod as AllocationMethod;
  let percentageBasisPoints = percentage(input.allocationPercentage);
  let allocatedAmountMinor = moneyToMinor(
    input.allocatedAmount,
    'Allocated amount',
    true,
  );
  if (allocationMethod === '100_PERCENT_BUSINESS') {
    percentageBasisPoints = 10_000;
    allocatedAmountMinor = premiumMinor;
  } else if (
    allocationMethod === 'MANUAL_PERCENTAGE' ||
    allocationMethod === 'BUSINESS_KM_OVER_TOTAL_KM'
  ) {
    if (percentageBasisPoints === null)
      throw new HttpError(
        400,
        'Allocation percentage is required for this method.',
      );
    allocatedAmountMinor = Math.round(
      (premiumMinor * percentageBasisPoints) / 10_000,
    );
  } else if (allocationMethod === 'ACCOUNTANT_ADJUSTMENT') {
    if (allocatedAmountMinor === null)
      throw new HttpError(
        400,
        'Allocated amount is required for an accountant adjustment.',
      );
    if (allocatedAmountMinor > premiumMinor)
      throw new HttpError(
        400,
        'Allocated amount cannot exceed the full premium.',
      );
    percentageBasisPoints =
      premiumMinor === 0
        ? 0
        : Math.round((allocatedAmountMinor * 10_000) / premiumMinor);
  } else {
    percentageBasisPoints = null;
    allocatedAmountMinor = null;
  }
  const calculationPeriodStart = allocationDate(
    input.calculationPeriodStart,
    'Calculation period start',
  );
  const calculationPeriodEnd = allocationDate(
    input.calculationPeriodEnd,
    'Calculation period end',
  );
  if (
    calculationPeriodStart &&
    calculationPeriodEnd &&
    calculationPeriodEnd < calculationPeriodStart
  ) {
    throw new HttpError(
      400,
      'Calculation period end cannot be before its start.',
    );
  }
  if (
    allocationMethod === 'BUSINESS_KM_OVER_TOTAL_KM' &&
    (!calculationPeriodStart || !calculationPeriodEnd)
  ) {
    throw new HttpError(
      400,
      'A calculation period is required for a kilometres-based allocation.',
    );
  }
  return {
    allocationMethod,
    percentageBasisPoints,
    allocatedAmountMinor,
    calculationPeriodStart,
    calculationPeriodEnd,
    notes: expenseText(input.allocationNotes, 'Allocation notes', 2000),
  };
}

export function allocationSummary(values: AllocationValues): string {
  const percentageText =
    values.percentageBasisPoints === null
      ? 'no percentage'
      : `${(values.percentageBasisPoints / 100).toFixed(2)}%`;
  const amountText =
    values.allocatedAmountMinor === null
      ? 'no allocated amount'
      : `${values.allocatedAmountMinor} minor units`;
  return `${values.allocationMethod}, ${percentageText}, ${amountText}`;
}
