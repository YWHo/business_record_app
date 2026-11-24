import { applyDemoOverlay } from './demoStore';
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
  return applyDemoOverlay(
    { businesses: staticDemoBusinesses() },
    '/api/businesses',
  );
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
