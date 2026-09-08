import { HttpError } from '../lib/http';
import { allocationDate } from './allocationService';
import { expenseId, expenseText, moneyToMinor } from './expenseService';

export type IncomeType = 'PLATFORM' | 'CONTRACT' | 'SUBSCRIPTION' | 'GENERAL';
export interface CommonIncomeValues {
  businessActivityId: string;
  incomeType: IncomeType;
  receivedFrom: string | null;
  transactionDate: string;
  totalAmountMinor: number;
  currency: string;
  notes: string | null;
}
export interface PlatformValues extends CommonIncomeValues {
  providerName: string;
  periodStart: string;
  periodEnd: string;
  paymentDate: string;
  grossEarningsMinor: number;
  tipsMinor: number;
  bonusesPromotionsMinor: number;
  flatRateCreditMinor: number;
  platformFeesMinor: number;
  otherAdjustmentsMinor: number;
  netPaymentReceivedMinor: number;
}
export interface ContractValues extends CommonIncomeValues {
  clientId: string;
  invoiceNumber: string;
  invoiceDate: string;
  servicePeriodStart: string | null;
  servicePeriodEnd: string | null;
  subtotalMinor: number;
  gstAmountMinor: number | null;
  totalMinor: number;
  dueDate: string | null;
  paymentReceivedDate: string | null;
  amountReceivedMinor: number | null;
  paymentStatus:
    'DRAFT' | 'ISSUED' | 'PARTIALLY_PAID' | 'PAID' | 'OVERDUE' | 'VOID';
}
export interface SubscriptionValues extends CommonIncomeValues {
  periodStart: string;
  periodEnd: string;
  grossSubscriptionRevenueMinor: number;
  refundsMinor: number;
  platformFeesMinor: number;
  paymentProcessingFeesMinor: number;
  netPaymentReceivedMinor: number;
  subscriberCount: number | null;
  newSubscribers: number | null;
  cancelledSubscribers: number | null;
}
export type IncomeValues =
  CommonIncomeValues | PlatformValues | ContractValues | SubscriptionValues;
const has = (input: Record<string, unknown>, field: string) =>
  Object.prototype.hasOwnProperty.call(input, field);

function requiredDate(value: unknown, label: string): string {
  const date = allocationDate(value, label);
  if (!date) throw new HttpError(400, `${label} is required.`);
  return date;
}
function money(
  input: Record<string, unknown>,
  field: string,
  label: string,
  current?: number | null,
  nullable = false,
) {
  return has(input, field)
    ? moneyToMinor(input[field], label, nullable)
    : (current ?? (nullable ? null : moneyToMinor(undefined, label)));
}
function signedMoney(value: unknown, label: string): number {
  if (value === undefined || value === null || value === '') return 0;
  if (typeof value !== 'string' && typeof value !== 'number')
    throw new HttpError(400, `${label} must have at most two decimals.`);
  const normalized = String(value).trim();
  if (!/^-?\d+(?:\.\d{1,2})?$/.test(normalized))
    throw new HttpError(400, `${label} must have at most two decimals.`);
  const sign = normalized.startsWith('-') ? -1 : 1;
  const absolute = normalized.replace('-', '');
  return sign * moneyToMinor(absolute, label)!;
}
function count(value: unknown, label: string): number | null {
  if (value === undefined || value === null || value === '') return null;
  const result = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(result) || result < 0 || result > 100_000_000)
    throw new HttpError(400, `${label} must be a non-negative whole number.`);
  return result;
}
function common(
  input: Record<string, unknown>,
  incomeType: IncomeType,
  transactionDate: string,
  totalAmountMinor: number,
  receivedFrom: string | null,
  current?: CommonIncomeValues,
): CommonIncomeValues {
  const currencyValue = has(input, 'currency')
    ? input.currency
    : (current?.currency ?? 'NZD');
  if (
    typeof currencyValue !== 'string' ||
    !/^[A-Za-z]{3}$/.test(currencyValue.trim())
  )
    throw new HttpError(400, 'Currency must be a three-letter code.');
  const businessActivityId = has(input, 'businessActivityId')
    ? expenseId(input.businessActivityId, 'Business activity', true)
    : current?.businessActivityId;
  if (!businessActivityId)
    throw new HttpError(400, 'Business activity is required.');
  return {
    businessActivityId,
    incomeType,
    receivedFrom,
    transactionDate,
    totalAmountMinor,
    currency: currencyValue.trim().toUpperCase(),
    notes: has(input, 'notes')
      ? expenseText(input.notes, 'Notes', 2000)
      : (current?.notes ?? null),
  };
}

export function incomeValues(
  input: Record<string, unknown>,
  current?: IncomeValues,
): IncomeValues {
  const rawType = has(input, 'incomeType')
    ? input.incomeType
    : current?.incomeType;
  if (
    typeof rawType !== 'string' ||
    !['PLATFORM', 'CONTRACT', 'SUBSCRIPTION', 'GENERAL'].includes(rawType)
  )
    throw new HttpError(400, 'Income type is invalid.');
  const type = rawType as IncomeType;
  if (current && type !== current.incomeType)
    throw new HttpError(400, 'Income type cannot be changed after creation.');
  if (type === 'PLATFORM') {
    const prior =
      current?.incomeType === 'PLATFORM'
        ? (current as PlatformValues)
        : undefined;
    const providerName = has(input, 'providerName')
      ? expenseText(input.providerName, 'Provider', 200, true)!
      : (prior?.providerName ?? expenseText(undefined, 'Provider', 200, true)!);
    const periodStart = has(input, 'periodStart')
      ? requiredDate(input.periodStart, 'Period start')
      : (prior?.periodStart ?? requiredDate(undefined, 'Period start'));
    const periodEnd = has(input, 'periodEnd')
      ? requiredDate(input.periodEnd, 'Period end')
      : (prior?.periodEnd ?? requiredDate(undefined, 'Period end'));
    if (periodEnd < periodStart)
      throw new HttpError(400, 'Period end cannot be before its start.');
    const paymentDate = has(input, 'paymentDate')
      ? requiredDate(input.paymentDate, 'Payment date')
      : (prior?.paymentDate ?? requiredDate(undefined, 'Payment date'));
    const net = money(
      input,
      'netPaymentReceived',
      'Net payment received',
      prior?.netPaymentReceivedMinor,
    )!;
    return {
      ...common(input, type, paymentDate, net, providerName, prior),
      providerName,
      periodStart,
      periodEnd,
      paymentDate,
      grossEarningsMinor: money(
        input,
        'grossEarnings',
        'Gross earnings',
        prior?.grossEarningsMinor,
      )!,
      tipsMinor: money(input, 'tips', 'Tips', prior?.tipsMinor ?? 0)!,
      bonusesPromotionsMinor: money(
        input,
        'bonusesPromotions',
        'Bonuses and promotions',
        prior?.bonusesPromotionsMinor ?? 0,
      )!,
      flatRateCreditMinor: money(
        input,
        'flatRateCredit',
        'Flat-rate credit',
        prior?.flatRateCreditMinor ?? 0,
      )!,
      platformFeesMinor: money(
        input,
        'platformFees',
        'Platform fees',
        prior?.platformFeesMinor ?? 0,
      )!,
      otherAdjustmentsMinor: has(input, 'otherAdjustments')
        ? signedMoney(input.otherAdjustments, 'Other adjustments')
        : (prior?.otherAdjustmentsMinor ?? 0),
      netPaymentReceivedMinor: net,
    };
  }
  if (type === 'CONTRACT') {
    const prior =
      current?.incomeType === 'CONTRACT'
        ? (current as ContractValues)
        : undefined;
    const invoiceDate = has(input, 'invoiceDate')
      ? requiredDate(input.invoiceDate, 'Invoice date')
      : (prior?.invoiceDate ?? requiredDate(undefined, 'Invoice date'));
    const total = money(input, 'total', 'Invoice total', prior?.totalMinor)!;
    const clientId = has(input, 'clientId')
      ? expenseId(input.clientId, 'Client', true)!
      : (prior?.clientId ?? expenseId(undefined, 'Client', true)!);
    const invoiceNumber = has(input, 'invoiceNumber')
      ? expenseText(input.invoiceNumber, 'Invoice number', 100, true)!
      : (prior?.invoiceNumber ??
        expenseText(undefined, 'Invoice number', 100, true)!);
    const start = has(input, 'servicePeriodStart')
      ? allocationDate(input.servicePeriodStart, 'Service period start')
      : (prior?.servicePeriodStart ?? null);
    const end = has(input, 'servicePeriodEnd')
      ? allocationDate(input.servicePeriodEnd, 'Service period end')
      : (prior?.servicePeriodEnd ?? null);
    if (start && end && end < start)
      throw new HttpError(
        400,
        'Service period end cannot be before its start.',
      );
    const paymentStatus = has(input, 'paymentStatus')
      ? input.paymentStatus
      : (prior?.paymentStatus ?? 'DRAFT');
    if (
      typeof paymentStatus !== 'string' ||
      ![
        'DRAFT',
        'ISSUED',
        'PARTIALLY_PAID',
        'PAID',
        'OVERDUE',
        'VOID',
      ].includes(paymentStatus)
    )
      throw new HttpError(400, 'Payment status is invalid.');
    const amountReceived = money(
      input,
      'amountReceived',
      'Amount received',
      prior?.amountReceivedMinor,
      true,
    );
    if (
      paymentStatus === 'PAID' &&
      (amountReceived === null || amountReceived < total)
    )
      throw new HttpError(
        400,
        'Paid invoices require an amount received at least equal to the invoice total.',
      );
    return {
      ...common(
        input,
        type,
        invoiceDate,
        total,
        has(input, 'receivedFrom')
          ? expenseText(input.receivedFrom, 'Received from', 200)
          : (prior?.receivedFrom ?? null),
        prior,
      ),
      clientId,
      invoiceNumber,
      invoiceDate,
      servicePeriodStart: start,
      servicePeriodEnd: end,
      subtotalMinor: money(
        input,
        'subtotal',
        'Subtotal',
        prior?.subtotalMinor,
      )!,
      gstAmountMinor: money(
        input,
        'gstAmount',
        'GST amount',
        prior?.gstAmountMinor,
        true,
      ),
      totalMinor: total,
      dueDate: has(input, 'dueDate')
        ? allocationDate(input.dueDate, 'Due date')
        : (prior?.dueDate ?? null),
      paymentReceivedDate: has(input, 'paymentReceivedDate')
        ? allocationDate(input.paymentReceivedDate, 'Payment received date')
        : (prior?.paymentReceivedDate ?? null),
      amountReceivedMinor: amountReceived,
      paymentStatus: paymentStatus as ContractValues['paymentStatus'],
    };
  }
  if (type === 'SUBSCRIPTION') {
    const prior =
      current?.incomeType === 'SUBSCRIPTION'
        ? (current as SubscriptionValues)
        : undefined;
    const periodStart = has(input, 'periodStart')
      ? requiredDate(input.periodStart, 'Period start')
      : (prior?.periodStart ?? requiredDate(undefined, 'Period start'));
    const periodEnd = has(input, 'periodEnd')
      ? requiredDate(input.periodEnd, 'Period end')
      : (prior?.periodEnd ?? requiredDate(undefined, 'Period end'));
    if (periodEnd < periodStart)
      throw new HttpError(400, 'Period end cannot be before its start.');
    const net = money(
      input,
      'netPaymentReceived',
      'Net payment received',
      prior?.netPaymentReceivedMinor,
    )!;
    const received = has(input, 'receivedFrom')
      ? expenseText(input.receivedFrom, 'Received from', 200)
      : (prior?.receivedFrom ?? 'Subscription platform');
    return {
      ...common(input, type, periodEnd, net, received, prior),
      periodStart,
      periodEnd,
      grossSubscriptionRevenueMinor: money(
        input,
        'grossSubscriptionRevenue',
        'Gross subscription revenue',
        prior?.grossSubscriptionRevenueMinor,
      )!,
      refundsMinor: money(
        input,
        'refunds',
        'Refunds',
        prior?.refundsMinor ?? 0,
      )!,
      platformFeesMinor: money(
        input,
        'platformFees',
        'Platform fees',
        prior?.platformFeesMinor ?? 0,
      )!,
      paymentProcessingFeesMinor: money(
        input,
        'paymentProcessingFees',
        'Payment processing fees',
        prior?.paymentProcessingFeesMinor ?? 0,
      )!,
      netPaymentReceivedMinor: net,
      subscriberCount: has(input, 'subscriberCount')
        ? count(input.subscriberCount, 'Subscriber count')
        : (prior?.subscriberCount ?? null),
      newSubscribers: has(input, 'newSubscribers')
        ? count(input.newSubscribers, 'New subscribers')
        : (prior?.newSubscribers ?? null),
      cancelledSubscribers: has(input, 'cancelledSubscribers')
        ? count(input.cancelledSubscribers, 'Cancelled subscribers')
        : (prior?.cancelledSubscribers ?? null),
    };
  }
  const prior = current?.incomeType === 'GENERAL' ? current : undefined;
  const transactionDate = has(input, 'transactionDate')
    ? requiredDate(input.transactionDate, 'Transaction date')
    : (prior?.transactionDate ?? requiredDate(undefined, 'Transaction date'));
  const total = money(
    input,
    'totalAmount',
    'Total amount',
    prior?.totalAmountMinor,
  )!;
  const received = has(input, 'receivedFrom')
    ? expenseText(input.receivedFrom, 'Received from', 200)
    : (prior?.receivedFrom ?? null);
  return common(input, type, transactionDate, total, received, prior);
}

export function reconciliationValues(input: Record<string, unknown>) {
  const expectedAmountMinor = moneyToMinor(
    input.expectedAmount,
    'Expected amount',
  )!;
  const actualAmountMinor = moneyToMinor(input.actualAmount, 'Actual amount')!;
  return {
    expectedAmountMinor,
    actualAmountMinor,
    matched: expectedAmountMinor === actualAmountMinor,
    notes: expenseText(input.notes, 'Reconciliation notes', 2000),
  };
}
