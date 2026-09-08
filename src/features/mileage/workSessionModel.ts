export interface ReferenceOption {
  id: string;
  label: string;
  active: boolean;
}

export interface WorkSessionDraft {
  businessActivityId: string;
  vehicleId: string;
  startedAt: string;
  endedAt: string;
  odometerStartKm: string;
  odometerEndKm: string;
  grossRevenue: string;
  currency: string;
  notes: string;
}

export const emptyWorkSessionDraft: WorkSessionDraft = {
  businessActivityId: '',
  vehicleId: '',
  startedAt: '',
  endedAt: '',
  odometerStartKm: '',
  odometerEndKm: '',
  grossRevenue: '',
  currency: 'NZD',
  notes: '',
};

export function localDateTimeValue(instant: string): string {
  const date = new Date(instant);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}
