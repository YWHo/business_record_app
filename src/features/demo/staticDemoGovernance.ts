import { applyDemoOverlay, demoStorageSnapshot } from './demoStore';
import { camelCaseDemoRow, readStaticDemoTable } from './staticDemo';
import { readStaticDemoRetentionSettings } from './staticDemoReferences';
import { calculateRetentionDate } from '../../../worker/services/workSessionService';
import { isPurgeEligible } from '../../../worker/services/retentionService';

type Row = Record<string, unknown>;
const types = {
  EXPENSE: 'expenses',
  INCOME: 'income_records',
  WORK_SESSION: 'work_sessions',
} as const;

export async function readStaticDemoTrash() {
  const sources = new Map<string, Row>();
  for (const [recordType, table] of Object.entries(types)) {
    for (const row of readStaticDemoTable(table)) {
      sources.set(`${recordType}:${String(row.id)}`, {
        ...camelCaseDemoRow(row),
        recordType,
      });
    }
  }
  const resourceTypes: Record<string, string> = {
    expenses: 'EXPENSE',
    'income-records': 'INCOME',
    'work-sessions': 'WORK_SESSION',
  };
  for (const operation of (await demoStorageSnapshot()).operations) {
    const type = resourceTypes[operation.resource];
    if (!type || !operation.recordId) {
      continue;
    }
    const key = `${type}:${operation.recordId}`;
    const before = sources.get(key);
    if (operation.method === 'POST' || before) {
      sources.set(key, {
        ...before,
        ...operation.body,
        id: operation.recordId,
        businessId: operation.businessId,
        legalEntityId: operation.legalEntityId,
        recordType: type,
      });
    }
  }
  const baseline = [...sources.values()].filter((row) => row.deletedAt);
  const payload = await applyDemoOverlay({ trash: baseline }, '/api/trash');
  const { retentionSettings: settings } =
    await readStaticDemoRetentionSettings();
  const trash: Row[] = [];
  for (const entry of payload.trash) {
    const source = sources.get(
      `${String(entry.recordType)}:${String(entry.id)}`,
    );
    if (!source || source.businessId !== entry.businessId) {
      continue;
    }
    const type = String(entry.recordType);
    const incomeDate =
      source.incomeType === 'PLATFORM'
        ? (source.paymentDate ?? source.transactionDate)
        : source.incomeType === 'SUBSCRIPTION'
          ? (source.periodEnd ?? source.transactionDate)
          : source.transactionDate;
    const dateValue =
      type === 'INCOME'
        ? (incomeDate ?? '')
        : (source.purchaseDatetime ?? source.startedAt ?? '');
    const occurredAt = typeof dateValue === 'string' ? dateValue : '';
    if (!Number.isFinite(Date.parse(occurredAt))) {
      continue;
    }
    const retentionUntil =
      typeof source.retentionUntil === 'string'
        ? source.retentionUntil
        : calculateRetentionDate(
            occurredAt,
            Number(settings.retentionTaxYears),
            Number(settings.taxYearEndMonth),
            Number(settings.taxYearEndDay),
          );
    const dayAfter = new Date(`${retentionUntil}T00:00:00Z`);
    dayAfter.setUTCDate(dayAfter.getUTCDate() + 1);
    const purgeEligibleAt =
      typeof source.purgeEligibleAt === 'string'
        ? source.purgeEligibleAt
        : dayAfter.toISOString().slice(0, 10);
    trash.push({
      id: entry.id,
      businessId: entry.businessId,
      legalEntityId: entry.legalEntityId,
      recordType: type,
      subtype: source.expenseType ?? source.incomeType ?? 'MILEAGE',
      label:
        source.merchantName ??
        source.receivedFrom ??
        source.providerName ??
        source.provider ??
        source.parkingProvider ??
        (type === 'WORK_SESSION'
          ? 'Work session'
          : type === 'EXPENSE'
            ? 'Expense'
            : 'Income'),
      recordDate: occurredAt.slice(0, 10),
      businessActivityId: source.businessActivityId ?? null,
      status: 'TRASHED',
      deletedAt: entry.deletedAt,
      retentionUntil,
      purgeEligibleAt,
      purgeEligible: isPurgeEligible(purgeEligibleAt),
      purgePending: Boolean(source.purgedAt),
    });
  }
  return {
    trash: trash
      .sort(
        (a, b) =>
          String(b.deletedAt).localeCompare(String(a.deletedAt)) ||
          String(b.id).localeCompare(String(a.id)),
      )
      .slice(0, 200),
  };
}

export async function readStaticDemoExportStatus() {
  const { retentionSettings } = await readStaticDemoRetentionSettings();
  // The fictional baseline has no completed archives. Browser downloads and
  // archive generation remain unavailable; never claim a private backup exists.
  return {
    backup: {
      reminderDays: retentionSettings.backupReminderDays,
      lastSuccessfulExportAt: null,
      due: true,
    },
    exports: [],
  };
}
