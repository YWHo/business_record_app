import dataset from './staticDemoDataset.json';
import evidence from './staticDemoEvidenceManifest.json';
import type { BusinessSummary } from '../business/BusinessDirectoryContext';

export {
  staticDemoDatasetVersion,
  staticDemoStorageName,
} from './demoDatasetVersion';
type TableName = keyof typeof dataset.tables;
export type DemoRow = Record<string, string | number | null>;

// Return independent rows so UI edits can never modify the imported baseline.
// This API has no URL, fetch, credentials, database binding or private state input.
export function readStaticDemoTable(table: TableName): DemoRow[] {
  return structuredClone(dataset.tables[table]);
}

export function camelCaseDemoRow(row: DemoRow): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase()),
      value,
    ]),
  );
}

export interface StaticDemoQuery {
  businessId?: string;
  legalEntityId?: string;
  status?: string;
  search?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

const dateColumns = {
  expenses: 'purchase_datetime',
  income_records: 'transaction_date',
  work_sessions: 'started_at',
} as const;

export function queryStaticDemoRecords(
  table: keyof typeof dateColumns,
  query: StaticDemoQuery = {},
  source: DemoRow[] = readStaticDemoTable(table),
) {
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? 50;
  if (
    !Number.isSafeInteger(page) ||
    page < 1 ||
    page > 10000 ||
    !Number.isSafeInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > 200
  ) {
    throw new Error('Invalid demo pagination.');
  }
  for (const bound of [query.from, query.to]) {
    if (
      bound !== undefined &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(bound) ||
        !Number.isFinite(Date.parse(bound)) ||
        new Date(bound).toISOString().slice(0, 10) !== bound)
    ) {
      throw new Error('Invalid demo date.');
    }
  }
  if (query.from && query.to && query.from > query.to) {
    throw new Error('Invalid demo date range.');
  }
  const search = query.search?.trim().toLocaleLowerCase('en-NZ');
  const dateColumn = dateColumns[table];
  const matching = source
    .filter((row) => {
      if (row.deleted_at || row.purged_at) {
        return false;
      }
      if (query.businessId && row.business_id !== query.businessId) {
        return false;
      }
      if (query.legalEntityId && row.legal_entity_id !== query.legalEntityId) {
        return false;
      }
      if (query.status && row.status !== query.status) {
        return false;
      }
      const date =
        table === 'income_records'
          ? String(row[dateColumn])
          : new Intl.DateTimeFormat('en-CA', {
              timeZone: 'Pacific/Auckland',
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
            }).format(new Date(String(row[dateColumn])));
      if ((query.from && date < query.from) || (query.to && date > query.to)) {
        return false;
      }
      return (
        !search ||
        [row.merchant_name, row.received_from, row.description, row.notes].some(
          (value) =>
            String(value ?? '')
              .toLocaleLowerCase('en-NZ')
              .includes(search),
        )
      );
    })
    .sort(
      (a, b) =>
        String(b[dateColumn]).localeCompare(String(a[dateColumn])) ||
        String(b.id).localeCompare(String(a.id)),
    );
  const start = (page - 1) * pageSize;
  return {
    records: matching.slice(start, start + pageSize).map(camelCaseDemoRow),
    resultCount: matching.length,
    page: {
      number: page,
      size: pageSize,
      hasNext: start + pageSize < matching.length,
    },
  };
}

export function staticDemoBusinesses(): BusinessSummary[] {
  const entities = readStaticDemoTable('business_entities');
  const periods = readStaticDemoTable('business_entity_periods');
  const records = ['expenses', 'income_records', 'work_sessions']
    .flatMap((table) => readStaticDemoTable(table as keyof typeof dateColumns))
    .filter((row) => !row.deleted_at && !row.purged_at);
  return readStaticDemoTable('businesses').map((business) => {
    const current = periods.find(
      (period) => period.business_id === business.id && !period.effective_to,
    );
    const entity = entities.find(
      (entity) => entity.id === current?.legal_entity_id,
    );
    const owned = records.filter((row) => row.business_id === business.id);
    return {
      ...camelCaseDemoRow(business),
      id: String(business.id),
      name: String(business.name),
      description:
        business.description === null ? null : String(business.description),
      businessType:
        business.business_type === null ? null : String(business.business_type),
      defaultCurrency: String(business.default_currency),
      status: business.status === 'ACTIVE' ? 'ACTIVE' : 'INACTIVE',
      legacyBusinessActivityId:
        business.legacy_business_activity_id === null
          ? null
          : String(business.legacy_business_activity_id),
      currentLegalEntity: entity
        ? {
            id: String(entity.id),
            entityType: String(entity.entity_type) as NonNullable<
              BusinessSummary['currentLegalEntity']
            >['entityType'],
            legalName:
              entity.legal_name === null ? null : String(entity.legal_name),
            tradingName:
              entity.trading_name === null ? null : String(entity.trading_name),
            status: entity.active ? 'ACTIVE' : 'INACTIVE',
            attributionReviewRequired: Boolean(
              entity.attribution_review_required,
            ),
          }
        : null,
      recordCount: owned.length,
      awaitingReviewCount: owned.filter((row) =>
        ['NEW', 'READY_FOR_REVIEW'].includes(String(row.status)),
      ).length,
      missingReceiptCount: owned.filter(
        (row) =>
          'expense_type' in row &&
          row.status !== 'VOIDED' &&
          !evidence.documents.some(
            (document) =>
              document.businessId === business.id &&
              document.recordType === 'EXPENSE' &&
              document.recordId === row.id,
          ),
      ).length,
      lastRecordUpdatedAt:
        owned
          .map((row) => String(row.updated_at))
          .sort()
          .at(-1) ?? null,
    };
  });
}
