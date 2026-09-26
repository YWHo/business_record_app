export type ExpenseType = 'GENERAL' | 'PARKING' | 'FUEL' | 'INSURANCE';

export interface BusinessExpense {
  id: string;
  businessId: string;
  legalEntityId: string;
  expenseType: ExpenseType;
  expenseCategoryId: string;
  categoryName: string;
  merchantName: string;
  purchaseDatetime: string;
  totalAmountMinor: number;
  currency: string;
  gstAmountMinor?: number | null;
  gstStatus?: string;
  description: string | null;
  recurrenceType?: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  vehicleId?: string | null;
  vehicleRegistration?: string | null;
  parkingProvider?: string | null;
  parkingLocation?: string;
  parkingStartDatetime?: string | null;
  parkingEndDatetime?: string | null;
  parkingReference?: string | null;
  fuelStation?: string | null;
  fuelPriceMicrosPerLitre?: number | null;
  fuelLitres?: number | null;
  odometerKm?: number | null;
  fillType?: string;
  notes?: string | null;
  provider?: string;
  premiumMinor?: number;
  insuranceType?: string;
  policyNumber?: string | null;
  policyPeriodStart?: string;
  policyPeriodEnd?: string;
  allocation?: {
    method: string;
    percentageBasisPoints: number | null;
    allocatedAmountMinor: number | null;
    calculationPeriodStart: string | null;
    calculationPeriodEnd: string | null;
    notes: string | null;
    reviewerEmail: string | null;
  };
}

export const expenseTypeLabels: Record<ExpenseType, string> = {
  GENERAL: 'General',
  PARKING: 'Parking',
  FUEL: 'Fuel',
  INSURANCE: 'Insurance',
};

export function plainLabel(value: string): string {
  return value
    .toLowerCase()
    .split('_')
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

export function formatMoney(minor: number, currency: string): string {
  return new Intl.NumberFormat('en-NZ', {
    style: 'currency',
    currency,
  }).format(minor / 100);
}

export function formatExpenseDate(value: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat('en-NZ', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      }).format(date)
    : value;
}
