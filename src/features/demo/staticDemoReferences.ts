import {
  applyDemoOverlay,
  demoBusinessEntityPeriods,
  demoStorageSnapshot,
} from './demoStore';
import { camelCaseDemoRow, readStaticDemoTable } from './staticDemo';
import { retentionSettingsValues } from '../../../worker/services/retentionService';

type Row = Record<string, unknown>;
const references = {
  activities: {
    table: 'business_activities',
    path: 'business-activities',
    fields: [
      'id',
      'name',
      'activityType',
      'active',
      'startedAt',
      'endedAt',
      'createdAt',
      'updatedAt',
    ],
  },
  vehicles: {
    table: 'vehicles',
    path: 'vehicles',
    fields: [
      'id',
      'registration',
      'description',
      'active',
      'acquiredAt',
      'retiredAt',
      'notes',
      'createdAt',
      'updatedAt',
    ],
  },
  clients: {
    table: 'clients',
    path: 'clients',
    fields: ['id', 'name', 'active', 'notes', 'createdAt', 'updatedAt'],
  },
  categories: {
    table: 'expense_categories',
    path: 'expense-categories',
    fields: ['id', 'name', 'active', 'systemKey', 'createdAt', 'updatedAt'],
  },
} as const;

export async function readStaticDemoReferences(kind: keyof typeof references) {
  if (!Object.hasOwn(references, kind)) {
    throw new Error('Invalid reference kind.');
  }
  const config = references[kind];
  const baseline = readStaticDemoTable(config.table).map((row) => {
    const source: Row = { ...camelCaseDemoRow(row), active: row.active === 1 };
    return Object.fromEntries(
      config.fields.map((field) => [field, source[field]]),
    );
  });
  const payload = await applyDemoOverlay(
    { [kind]: baseline },
    `/api/${config.path}`,
  );
  const field = kind === 'vehicles' ? 'registration' : 'name';
  return {
    [kind]: payload[kind]
      .map((row): Row => ({
        ...row,
        active: row.active ?? true,
        ...(kind === 'categories' ? { systemKey: row.systemKey ?? null } : {}),
        ...(kind === 'clients' || kind === 'vehicles'
          ? { notes: row.notes || null }
          : {}),
      }))
      .sort(
        (a, b) =>
          Number(Boolean(b.active)) - Number(Boolean(a.active)) ||
          String(a[field])
            .toLowerCase()
            .localeCompare(String(b[field]).toLowerCase()),
      )
      .slice(0, 200),
  };
}

export function readStaticDemoLegalEntities() {
  return {
    legalEntities: readStaticDemoTable('business_entities')
      .map((row) => {
        const source = camelCaseDemoRow(row);
        delete source.active;
        return {
          ...source,
          id: String(row.id),
          legalName: row.legal_name,
          tradingName: row.trading_name,
          status: row.active === 1 ? 'ACTIVE' : 'INACTIVE',
          attributionReviewRequired: row.attribution_review_required === 1,
        };
      })
      .sort((a, b) =>
        String(a.legalName ?? a.tradingName ?? a.id)
          .toLowerCase()
          .localeCompare(
            String(b.legalName ?? b.tradingName ?? b.id).toLowerCase(),
          ),
      )
      .slice(0, 100),
  };
}

export async function readStaticDemoBusinessDetails(businessId: string) {
  const baseline = readStaticDemoTable('businesses').find(
    (row) => row.id === businessId,
  );
  if (!baseline) {
    throw new Error('Demo business not found.');
  }
  const entities = readStaticDemoLegalEntities().legalEntities;
  const seedPeriods = readStaticDemoTable('business_entity_periods')
    .filter((row) => row.business_id === businessId)
    .map(camelCaseDemoRow);
  const periods = await demoBusinessEntityPeriods(businessId);
  const operatingPeriods = periods
    .map((period) => ({
      ...seedPeriods.find((seed) => seed.id === period.id),
      ...period,
      legalEntity:
        entities.find((entity) => entity.id === period.legalEntityId) ?? null,
    }))
    .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
  const result = await applyDemoOverlay(
    {
      business: camelCaseDemoRow(baseline),
      operatingPeriods,
      currentLegalEntity:
        operatingPeriods.find((period) => period.effectiveTo === null)
          ?.legalEntity ?? null,
    },
    `/api/businesses/${encodeURIComponent(businessId)}`,
  );
  // The legacy overlay period projection is intentionally minimal. Restore
  // immutable seeded creation metadata for unchanged historical period IDs.
  return {
    ...result,
    operatingPeriods: result.operatingPeriods
      .map((period) => ({
        ...seedPeriods.find((seed) => seed.id === period.id),
        ...period,
      }))
      .sort((a, b) =>
        String(a.effectiveFrom).localeCompare(String(b.effectiveFrom)),
      ),
  };
}

export async function readStaticDemoRetentionSettings() {
  const baseline = readStaticDemoTable('retention_settings')[0];
  const source = camelCaseDemoRow(baseline);
  const fields = [
    'retentionTaxYears',
    'taxYearEndMonth',
    'taxYearEndDay',
    'backupReminderDays',
    'updatedAt',
  ];
  const settings = Object.fromEntries(
    fields.map((field) => [field, source[field]]),
  );
  for (const operation of (await demoStorageSnapshot()).operations) {
    if (operation.resource === 'retention-settings') {
      Object.assign(
        settings,
        Object.fromEntries(
          fields
            .filter((field) => field in operation.body)
            .map((field) => [field, operation.body[field]]),
        ),
        { updatedAt: operation.createdAt },
      );
    }
  }
  retentionSettingsValues(settings);
  return { retentionSettings: settings };
}
