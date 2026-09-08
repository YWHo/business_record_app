import { describe, expect, it } from 'vitest';
import {
  incomeValues,
  reconciliationValues,
  type ContractValues,
  type PlatformValues,
  type SubscriptionValues,
} from './incomeService';

const common = { businessActivityId: 'activity-1', currency: 'nzd' };

describe('income validation', () => {
  it('normalizes a configurable platform payout and signed adjustments', () => {
    const result = incomeValues({
      ...common,
      incomeType: 'PLATFORM',
      providerName: 'Local Delivery Co',
      periodStart: '2026-09-01',
      periodEnd: '2026-09-07',
      paymentDate: '2026-09-08',
      grossEarnings: '100.00',
      tips: '10',
      bonusesPromotions: '5',
      flatRateCredit: '2',
      platformFees: '20',
      otherAdjustments: '-3.00',
      netPaymentReceived: '94.00',
    }) as PlatformValues;
    expect(result).toMatchObject({
      providerName: 'Local Delivery Co',
      currency: 'NZD',
      totalAmountMinor: 9400,
      grossEarningsMinor: 10000,
      otherAdjustmentsMinor: -300,
    });
  });

  it('tracks contract invoice value and partial payment separately', () => {
    const result = incomeValues({
      ...common,
      incomeType: 'CONTRACT',
      clientId: 'client-1',
      invoiceNumber: 'INV-101',
      invoiceDate: '2026-09-01',
      subtotal: '1000',
      gstAmount: '150',
      total: '1150',
      paymentStatus: 'PARTIALLY_PAID',
      paymentReceivedDate: '2026-09-08',
      amountReceived: '575',
    }) as ContractValues;
    expect(result.totalAmountMinor).toBe(115000);
    expect(result.amountReceivedMinor).toBe(57500);
  });

  it('rejects paid invoices without full payment', () => {
    expect(() =>
      incomeValues({
        ...common,
        incomeType: 'CONTRACT',
        clientId: 'client-1',
        invoiceNumber: 'INV-102',
        invoiceDate: '2026-09-01',
        subtotal: '100',
        total: '100',
        paymentStatus: 'PAID',
        amountReceived: '99',
      }),
    ).toThrow('Paid invoices require an amount received');
  });

  it('stores only aggregate subscription metrics', () => {
    const result = incomeValues({
      ...common,
      incomeType: 'SUBSCRIPTION',
      periodStart: '2026-08-01',
      periodEnd: '2026-08-31',
      grossSubscriptionRevenue: '500',
      refunds: '20',
      platformFees: '30',
      paymentProcessingFees: '10',
      netPaymentReceived: '440',
      subscriberCount: '42',
    }) as SubscriptionValues;
    expect(result).toMatchObject({
      totalAmountMinor: 44000,
      subscriberCount: 42,
      refundsMinor: 2000,
    });
  });

  it('derives reconciliation status from exact minor-unit amounts', () => {
    expect(
      reconciliationValues({ expectedAmount: '94', actualAmount: '93' }),
    ).toMatchObject({
      expectedAmountMinor: 9400,
      actualAmountMinor: 9300,
      matched: false,
    });
    expect(
      reconciliationValues({ expectedAmount: '94', actualAmount: '94.00' }),
    ).toMatchObject({ matched: true });
  });
});
