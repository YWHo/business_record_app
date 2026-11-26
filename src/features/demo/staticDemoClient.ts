import { applyDemoOverlay, demoStorageSnapshot } from './demoStore';
import { readStaticDemoDetailCollection } from './staticDemoDetails';
import { staticDemoEvidenceCounts } from './staticDemoEvidence';
import {
  camelCaseDemoRow,
  queryStaticDemoRecords,
  readStaticDemoTable,
  staticDemoBusinesses,
  type DemoRow,
  type StaticDemoQuery,
} from './staticDemo';

const recordCollections = {
  expenses: { table: 'expenses', property: 'expenses' },
  income: { table: 'income_records', property: 'incomeRecords' },
  'work-sessions': { table: 'work_sessions', property: 'sessions' },
} as const;

export async function readStaticDemoBusinesses() {
  const operations = (await demoStorageSnapshot()).operations;
  const baselineRecords = (
    ['expenses', 'income_records', 'work_sessions'] as const
  ).flatMap((table) => readStaticDemoTable(table));
  const result = await applyDemoOverlay(
    { businesses: staticDemoBusinesses() },
    '/api/businesses',
  );
  for (const business of result.businesses) {
    const [expenses, income, counts] = await Promise.all([
      readStaticDemoDetailCollection(business.id, 'expenses'),
      readStaticDemoDetailCollection(business.id, 'income'),
      staticDemoEvidenceCounts(business.id),
    ]);
    business.awaitingReviewCount = [...expenses, ...income].filter(
      (row) =>
        !['REVIEWED', 'PROCESSED', 'VOIDED'].includes(String(row.status)),
    ).length;
    const source = baselineRecords.filter(
      (row) => row.business_id === business.id && !row.purged_at,
    );
    const recordIds = new Set(source.map((row) => String(row.id)));
    const timestamps = source.map((row) => String(row.updated_at));
    for (const operation of operations) {
      if (
        operation.businessId !== business.id ||
        ![
          'expenses',
          'income-records',
          'work-sessions',
          'record-status',
          'trash',
          'trash/restore',
          'work-sessions/fuel-workflow',
        ].includes(operation.resource)
      ) {
        continue;
      }
      if (
        operation.method === 'POST' &&
        ['expenses', 'income-records', 'work-sessions'].includes(
          operation.resource,
        )
      ) {
        recordIds.add(operation.recordId ?? operation.id);
      }
      timestamps.push(operation.createdAt);
    }
    business.recordCount = recordIds.size;
    business.lastRecordUpdatedAt = timestamps.sort().at(-1) ?? null;
    business.missingReceiptCount = expenses.filter(
      (expense) =>
        expense.status !== 'VOIDED' &&
        !counts.has(`EXPENSE:${String(expense.id)}`),
    ).length;
  }
  return result;
}

// Overlay before filtering/counting/pagination, so an edited or newly created
// record cannot appear on the wrong page or survive a filter it no longer matches.
export async function readStaticDemoRecords(
  businessId: string,
  collection: keyof typeof recordCollections,
  query: Omit<StaticDemoQuery, 'businessId'> = {},
) {
  if (
    !readStaticDemoTable('businesses').some(
      (business) => business.id === businessId,
    )
  ) {
    throw new Error('Demo business not found.');
  }
  const { table, property } = recordCollections[collection];
  const rows = readStaticDemoTable(table).filter(
    (row) => row.business_id === businessId,
  );
  const payload = await applyDemoOverlay(
    { [property]: rows.map(camelCaseDemoRow) },
    `/api/businesses/${encodeURIComponent(businessId)}/${collection}`,
  );
  const source = payload[property].map(
    (row) =>
      Object.fromEntries(
        Object.entries(row).map(([key, value]) => [
          key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`),
          value,
        ]),
      ) as DemoRow,
  );
  return queryStaticDemoRecords(table, { ...query, businessId }, source);
}
