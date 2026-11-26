import { requestPagination, pageResult } from '../../../worker/lib/pagination';
import { readStaticDemoDetailCollection } from './staticDemoDetails';
import { applyDemoOverlay } from './demoStore';
import { readStaticDemoTable } from './staticDemo';

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function date(value: string | null) {
  if (!value) {
    return null;
  }
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString().slice(0, 10) !== value
  ) {
    throw new Error('Invalid transaction date.');
  }
  return value;
}
function money(value: string | null) {
  if (!value) {
    return null;
  }
  const minor = Math.round(Number(value) * 100);
  if (!/^\d+(?:\.\d{1,2})?$/.test(value) || !Number.isSafeInteger(minor)) {
    throw new Error('Invalid transaction amount.');
  }
  return minor;
}

export async function readStaticDemoTransactions(
  businessId?: string,
  query = new URLSearchParams(),
) {
  const pagination = requestPagination(
    new URL(`https://demo.invalid/?${query}`),
  );
  let from = date(query.get('dateFrom'));
  let to = date(query.get('dateTo'));
  const taxYear = query.get('taxYear');
  if (taxYear) {
    if (!/^\d{4}$/.test(taxYear) || Number(taxYear) < 1901) {
      throw new Error('Invalid tax year.');
    }
    from = `${Number(taxYear) - 1}-04-01`;
    to = `${taxYear}-03-31`;
  }
  const min = money(query.get('amountMin')),
    max = money(query.get('amountMax'));
  if (
    (from && to && from > to) ||
    (min !== null && max !== null && min > max)
  ) {
    throw new Error('Invalid transaction range.');
  }
  for (const [key, allowed] of Object.entries({
    direction: ['INCOME', 'EXPENSE'],
    subtype: [
      'PLATFORM',
      'CONTRACT',
      'SUBSCRIPTION',
      'GENERAL',
      'FUEL',
      'PARKING',
      'INSURANCE',
    ],
    status: [
      'NEW',
      'MISSING_INFORMATION',
      'READY_FOR_REVIEW',
      'REVIEWED',
      'PROCESSED',
      'VOIDED',
    ],
    attachment: ['PRESENT', 'MISSING'],
    review: ['REVIEWED', 'UNREVIEWED'],
  })) {
    const value = query.get(key)?.trim();
    if (value && !allowed.includes(value)) {
      throw new Error(`Invalid ${key} filter.`);
    }
  }
  const businesses = readStaticDemoTable('businesses').filter(
    (row) => !businessId || row.id === businessId,
  );
  if (businessId && !businesses.length) {
    throw new Error('Demo business not found.');
  }
  const activityNames = new Map(
    readStaticDemoTable('business_activities').map((row) => [row.id, row.name]),
  );
  const all = (
    await Promise.all(
      businesses.map(async (business) => {
        const id = String(business.id);
        const [expenses, income, documents] = await Promise.all([
          readStaticDemoDetailCollection(id, 'expenses'),
          readStaticDemoDetailCollection(id, 'income'),
          applyDemoOverlay(
            { documents: [] as Record<string, unknown>[] },
            `/api/businesses/${id}/documents`,
          ),
        ]);
        return [
          ...expenses.map((row) => ({ row, recordType: 'EXPENSE' })),
          ...income.map((row) => ({ row, recordType: 'INCOME' })),
        ].map(({ row, recordType }) => ({
          id: String(row.id),
          businessId: id,
          legalEntityId: row.legalEntityId,
          recordType,
          subtype: text(row.expenseType ?? row.incomeType),
          transactionDate: String(
            recordType === 'EXPENSE'
              ? row.purchaseDatetime
              : row.transactionDate,
          ).slice(0, 10),
          businessActivityId: row.businessActivityId ?? null,
          activityName:
            activityNames.get(String(row.businessActivityId)) ?? null,
          counterparty: text(row.merchantName ?? row.receivedFrom),
          totalAmountMinor: Number(row.totalAmountMinor),
          currency: row.currency,
          status: row.status,
          categoryId: row.expenseCategoryId ?? null,
          categoryName: row.categoryName ?? null,
          vehicleId: row.vehicleId ?? null,
          vehicleRegistration: row.vehicleRegistration ?? null,
          reviewedBy: row.reviewedBy ?? null,
          reviewedAt: row.reviewedAt ?? null,
          reviewerEmail:
            row.reviewedBy === 'demo-accountant'
              ? 'demo-accountant@example.invalid'
              : null,
          attachmentCount: documents.documents.filter(
            (doc) =>
              doc.recordId === row.id &&
              doc.recordType === recordType &&
              doc.isCurrent !== false,
          ).length,
        }));
      }),
    )
  ).flat();
  const filtered = all
    .filter((row) => {
      if (
        (from && row.transactionDate < from) ||
        (to && row.transactionDate > to)
      ) {
        return false;
      }
      for (const [parameter, field] of Object.entries({
        legalEntityId: 'legalEntityId',
        activityId: 'businessActivityId',
        direction: 'recordType',
        subtype: 'subtype',
        categoryId: 'categoryId',
        status: 'status',
        vehicleId: 'vehicleId',
      })) {
        const value = query.get(parameter)?.trim();
        if (value && row[field as keyof typeof row] !== value) {
          return false;
        }
      }
      const q = query.get('q')?.trim().toLowerCase();
      if (
        q &&
        ![row.counterparty, row.subtype].some((value) =>
          value.toLowerCase().includes(q),
        )
      ) {
        return false;
      }
      const counterparty = query.get('counterparty')?.trim().toLowerCase();
      if (
        counterparty &&
        !row.counterparty.toLowerCase().includes(counterparty)
      ) {
        return false;
      }
      if (
        (min !== null && row.totalAmountMinor < min) ||
        (max !== null && row.totalAmountMinor > max)
      ) {
        return false;
      }
      if (query.get('attachment') === 'PRESENT' && !row.attachmentCount) {
        return false;
      }
      if (query.get('attachment') === 'MISSING' && row.attachmentCount) {
        return false;
      }
      if (query.get('review') === 'REVIEWED' && !row.reviewedBy) {
        return false;
      }
      return !(
        query.get('review') === 'UNREVIEWED' &&
        (row.reviewedBy || row.status === 'VOIDED')
      );
    })
    .sort(
      (a, b) =>
        b.transactionDate.localeCompare(a.transactionDate) ||
        b.id.localeCompare(a.id),
    );
  const result = pageResult(
    filtered.slice(pagination.offset, pagination.offset + pagination.limit),
    pagination,
  );
  return {
    transactions: result.items,
    page: result.page,
    summary: {
      resultCount: result.items.length,
      missingAttachmentCount: result.items.filter((row) => !row.attachmentCount)
        .length,
      unreviewedCount: result.items.filter((row) => !row.reviewedBy).length,
    },
  };
}
