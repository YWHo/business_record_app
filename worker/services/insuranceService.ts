import { HttpError } from '../lib/http';
import { allocationDate } from './allocationService';
import {
  commonExpenseValues,
  expenseId,
  expenseText,
  type CommonExpenseValues,
} from './expenseService';

export type InsuranceType = 'PROFESSIONAL_LIABILITY' | 'VEHICLE' | 'OTHER';
export interface InsuranceValues extends CommonExpenseValues {
  insuranceType: InsuranceType;
  provider: string;
  policyNumber: string | null;
  policyPeriodStart: string;
  policyPeriodEnd: string;
  vehicleId: string | null;
}
const has = (input: Record<string, unknown>, field: string) =>
  Object.prototype.hasOwnProperty.call(input, field);

export function insuranceValues(
  input: Record<string, unknown>,
  categoryId: string,
  current?: InsuranceValues,
): InsuranceValues {
  const insuranceType = has(input, 'insuranceType')
    ? input.insuranceType
    : current?.insuranceType;
  if (
    typeof insuranceType !== 'string' ||
    !['PROFESSIONAL_LIABILITY', 'VEHICLE', 'OTHER'].includes(insuranceType)
  ) {
    throw new HttpError(400, 'Insurance type is invalid.');
  }
  const provider = has(input, 'provider')
    ? expenseText(input.provider, 'Provider', 200, true)!
    : (current?.provider ?? expenseText(undefined, 'Provider', 200, true)!);
  const common = commonExpenseValues(
    { merchantName: provider, ...input, expenseCategoryId: categoryId },
    current,
  );
  const policyPeriodStart = has(input, 'policyPeriodStart')
    ? allocationDate(input.policyPeriodStart, 'Policy period start')
    : (current?.policyPeriodStart ?? null);
  const policyPeriodEnd = has(input, 'policyPeriodEnd')
    ? allocationDate(input.policyPeriodEnd, 'Policy period end')
    : (current?.policyPeriodEnd ?? null);
  if (!policyPeriodStart || !policyPeriodEnd)
    throw new HttpError(400, 'Policy period start and end are required.');
  if (policyPeriodEnd < policyPeriodStart)
    throw new HttpError(400, 'Policy period end cannot be before its start.');
  const vehicleId = has(input, 'vehicleId')
    ? expenseId(input.vehicleId, 'Vehicle')
    : (current?.vehicleId ?? null);
  if (insuranceType === 'VEHICLE' && !vehicleId)
    throw new HttpError(400, 'Vehicle insurance requires a vehicle.');
  if (
    insuranceType === 'PROFESSIONAL_LIABILITY' &&
    !common.businessActivityId
  ) {
    throw new HttpError(
      400,
      'Professional liability insurance requires a business activity.',
    );
  }
  return {
    ...common,
    insuranceType: insuranceType as InsuranceType,
    provider,
    policyNumber: has(input, 'policyNumber')
      ? expenseText(input.policyNumber, 'Policy number', 200)
      : (current?.policyNumber ?? null),
    policyPeriodStart,
    policyPeriodEnd,
    vehicleId,
  };
}
