export interface ReferenceOption {
  id: string;
  label: string;
  active: boolean;
}
export interface ExpenseDraft {
  businessActivityId: string;
  expenseCategoryId: string;
  merchantName: string;
  purchaseDatetime: string;
  totalAmount: string;
  currency: string;
  gstAmount: string;
  gstStatus: string;
  description: string;
  recurrenceType: string;
}
export interface ParkingDraft extends ExpenseDraft {
  vehicleId: string;
  parkingProvider: string;
  parkingLocation: string;
  parkingStartDatetime: string;
  parkingEndDatetime: string;
  parkingReference: string;
}
export function localDateTime(value = new Date().toISOString()) {
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}
export function emptyExpenseDraft(): ExpenseDraft {
  return {
    businessActivityId: '',
    expenseCategoryId: '',
    merchantName: '',
    purchaseDatetime: localDateTime(),
    totalAmount: '',
    currency: 'NZD',
    gstAmount: '',
    gstStatus: 'UNKNOWN',
    description: '',
    recurrenceType: 'ONE_OFF',
  };
}
export function emptyParkingDraft(): ParkingDraft {
  return {
    ...emptyExpenseDraft(),
    vehicleId: '',
    parkingProvider: '',
    parkingLocation: '',
    parkingStartDatetime: '',
    parkingEndDatetime: '',
    parkingReference: '',
  };
}
export function expenseBody<T extends ExpenseDraft>(draft: T) {
  const convert = (value: string) =>
    value ? new Date(value).toISOString() : null;
  const parking = draft as unknown as ParkingDraft;
  return {
    ...draft,
    purchaseDatetime: convert(draft.purchaseDatetime),
    ...('parkingStartDatetime' in draft
      ? {
          parkingStartDatetime: convert(parking.parkingStartDatetime),
          parkingEndDatetime: convert(parking.parkingEndDatetime),
        }
      : {}),
  };
}
