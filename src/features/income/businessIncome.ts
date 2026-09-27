import type { IncomeRecord, IncomeType } from '../../routes/IncomePage';

export const incomeTypeLabels: Record<IncomeType, string> = {
  PLATFORM: 'Platform payout',
  CONTRACT: 'Contract invoice',
  SUBSCRIPTION: 'Subscription summary',
  GENERAL: 'General income',
};

export function incomeTitle(record: IncomeRecord): string {
  if (record.incomeType === 'PLATFORM')
    return String(record.details?.providerName || 'Platform payout');
  if (record.incomeType === 'CONTRACT') {
    const client = String(record.details?.clientName || 'Contract client');
    const invoice = String(record.details?.invoiceNumber || 'Invoice');
    return `${client} · ${invoice}`;
  }
  if (record.incomeType === 'SUBSCRIPTION') {
    const start = String(record.details?.periodStart || 'Unknown period');
    const end = String(record.details?.periodEnd || 'Unknown period');
    return `${start} to ${end}`;
  }
  return record.receivedFrom || 'General income';
}

export function incomeMoney(minor: number, currency: string): string {
  return new Intl.NumberFormat('en-NZ', {
    style: 'currency',
    currency,
  }).format(minor / 100);
}

export function incomeDate(value: string): string {
  return new Intl.DateTimeFormat('en-NZ', { dateStyle: 'medium' }).format(
    new Date(`${value.slice(0, 10)}T00:00:00`),
  );
}

export function plainIncomeValue(value: string): string {
  return value
    .toLowerCase()
    .replaceAll('_', ' ')
    .replace(/^./, (letter) => letter.toUpperCase());
}
