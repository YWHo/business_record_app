export const demoStorageSchemaVersion = 2;

export interface DemoBusinessEntityPeriod {
  id: string;
  businessId: string;
  legalEntityId: string;
  effectiveFrom: string;
  effectiveTo: string | null;
}

export interface DemoOperation {
  schemaVersion: typeof demoStorageSchemaVersion;
  id: string;
  method: string;
  path: string;
  resource: string;
  scope: 'ACCOUNT' | 'BUSINESS';
  businessId: string | null;
  legalEntityId: string | null;
  recordId: string | null;
  body: Record<string, unknown>;
  createdAt: string;
}

interface LegacyDemoOperation {
  id: string;
  method: string;
  path: string;
  body: Record<string, unknown>;
  createdAt: string;
}

interface RecordScope {
  businessId: string;
  legalEntityId: string | null;
}

const databaseName = 'business-records-public-demo';
const legacyStoreName = 'overlay';
const legacyOperationsKey = 'operations';
const operationStoreName = 'operations';
const periodStoreName = 'business-entity-periods';
const metadataStoreName = 'metadata';
const accountScopedResources = new Set([
  'business-activities',
  'clients',
  'expense-categories',
  'retention-settings',
  'saved-filters',
  'users',
  'invitations',
]);
const crossRecordResources = new Set([
  'record-status',
  'trash',
  'trash/restore',
  'comments',
  'attachments',
  'income-reconciliations',
  'insurance-allocations',
  'work-sessions/fuel-workflow',
]);
const nonCreatingCommands = new Set([
  'record-status',
  'trash',
  'trash/restore',
  'income-reconciliations',
  'insurance-allocations',
  'work-sessions/fuel-workflow',
]);

export const defaultDemoBusinessEntityPeriods: DemoBusinessEntityPeriod[] = [
  {
    id: 'period-business-demo-activity-delivery-initial',
    businessId: 'business-demo-activity-delivery',
    legalEntityId: 'business-entity-primary',
    effectiveFrom: '2026-04-01',
    effectiveTo: null,
  },
  {
    id: 'period-business-demo-activity-rideshare-initial',
    businessId: 'business-demo-activity-rideshare',
    legalEntityId: 'business-entity-primary',
    effectiveFrom: '2026-04-01',
    effectiveTo: '2026-06-30',
  },
  {
    id: 'period-business-demo-activity-rideshare-company',
    businessId: 'business-demo-activity-rideshare',
    legalEntityId: 'demo-entity-taxi-limited',
    effectiveFrom: '2026-07-01',
    effectiveTo: null,
  },
  {
    id: 'period-business-demo-activity-contracting-initial',
    businessId: 'business-demo-activity-contracting',
    legalEntityId: 'business-entity-primary',
    effectiveFrom: '2026-04-01',
    effectiveTo: null,
  },
  {
    id: 'period-business-demo-activity-saas-initial',
    businessId: 'business-demo-activity-saas',
    legalEntityId: 'demo-entity-saas-limited',
    effectiveFrom: '2026-04-01',
    effectiveTo: null,
  },
];

let memoryOperations: DemoOperation[] = [];
let memoryPeriods = structuredClone(defaultDemoBusinessEntityPeriods);
const recordScopes = new Map<string, RecordScope>();

function origin(): string {
  return globalThis.location?.origin ?? 'https://demo.invalid';
}

function parsedBody(body: BodyInit | null | undefined) {
  if (typeof body === 'string') {
    try {
      const parsed: unknown = JSON.parse(body);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  }
  if (typeof FormData !== 'undefined' && body instanceof FormData) {
    const result: Record<string, unknown> = {};
    for (const [key, value] of body.entries())
      result[key] = value instanceof File ? value.name : value;
    return result;
  }
  return {};
}

function stringValue(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number'
    ? String(value)
    : '';
}

function routeBusinessId(pathname: string): string | null {
  const match = pathname.match(/^\/api\/businesses\/([^/]+)(?:\/|$)/);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

function resourceForPath(pathname: string): string {
  const scoped = pathname.match(/^\/api\/businesses\/[^/]+\/(.+)$/);
  if (scoped) {
    const resource = scoped[1].replace(/^\/+|\/+$/g, '');
    return resource === 'income' ? 'income-records' : resource;
  }
  return pathname.replace(/^\/api\//, '').replace(/^\/+|\/+$/g, '');
}

function businessFromActivity(value: unknown): string | null {
  const activityId = stringValue(value).trim();
  return activityId ? `business-${activityId}` : null;
}

function recordIdFor(
  body: Record<string, unknown>,
  pathname: string,
): string | null {
  const explicit = stringValue(
    body.recordId ?? body.id ?? body.incomeId ?? body.expenseId,
  ).trim();
  if (explicit) return explicit;
  const segments = pathname.split('/').filter(Boolean);
  return segments.length > 4 ? (segments.at(-1) ?? null) : null;
}

function businessForOperation(
  pathname: string,
  body: Record<string, unknown>,
  recordId: string | null,
): string | null {
  const explicit = stringValue(
    body.businessId ?? body.business_id ?? routeBusinessId(pathname),
  ).trim();
  if (explicit) return explicit;
  const fromActivity = businessFromActivity(
    body.businessActivityId ?? body.business_activity_id,
  );
  if (fromActivity) return fromActivity;
  return recordId ? (recordScopes.get(recordId)?.businessId ?? null) : null;
}

function calendarDate(value: string): string | null {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
      ? value
      : null;
  }
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return null;
  const parts = new Intl.DateTimeFormat('en-NZ', {
    timeZone: 'Pacific/Auckland',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(timestamp));
  const part = (type: 'year' | 'month' | 'day') =>
    parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function effectiveDate(body: Record<string, unknown>): string | null {
  for (const field of [
    'purchaseDatetime',
    'startedAt',
    'paymentDate',
    'invoiceDate',
    'transactionDate',
    'effectiveFrom',
  ]) {
    const value = stringValue(body[field]);
    if (value) return calendarDate(value);
  }
  return null;
}

function resolveLegalEntity(
  businessId: string,
  body: Record<string, unknown>,
  periods: DemoBusinessEntityPeriod[],
  recordId: string | null,
): string | null {
  const scoped = recordId ? recordScopes.get(recordId) : null;
  const date = effectiveDate(body);
  if (!date) return scoped?.legalEntityId ?? null;
  const matches = periods.filter(
    (period) =>
      period.businessId === businessId &&
      period.effectiveFrom <= date &&
      (period.effectiveTo === null || period.effectiveTo >= date),
  );
  return matches.length === 1 ? matches[0].legalEntityId : null;
}

function normalizeOperation(
  operation: LegacyDemoOperation,
  periods: DemoBusinessEntityPeriod[],
): DemoOperation | null {
  const pathname = new URL(operation.path, origin()).pathname;
  const resource = resourceForPath(pathname);
  const recordId = recordIdFor(operation.body, pathname);
  const businessId = businessForOperation(pathname, operation.body, recordId);
  const accountScoped = accountScopedResources.has(resource);
  if (!accountScoped && !businessId) return null;
  return {
    schemaVersion: demoStorageSchemaVersion,
    id: operation.id,
    method: operation.method.toUpperCase(),
    path: pathname,
    resource,
    scope: businessId ? 'BUSINESS' : 'ACCOUNT',
    businessId,
    legalEntityId: businessId
      ? resolveLegalEntity(businessId, operation.body, periods, recordId)
      : null,
    recordId,
    body: operation.body,
    createdAt: operation.createdAt,
  };
}

export function migrateLegacyDemoOperations(
  legacy: LegacyDemoOperation[],
  periods: DemoBusinessEntityPeriod[] = defaultDemoBusinessEntityPeriods,
): DemoOperation[] {
  return legacy.flatMap((operation) => {
    const migrated = normalizeOperation(operation, periods);
    return migrated ? [migrated] : [];
  });
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, demoStorageSchemaVersion);
    request.onupgradeneeded = (event) => {
      const database = request.result;
      const transaction = request.transaction!;
      const operations = database.objectStoreNames.contains(operationStoreName)
        ? transaction.objectStore(operationStoreName)
        : database.createObjectStore(operationStoreName, { keyPath: 'id' });
      if (!operations.indexNames.contains('by-business'))
        operations.createIndex('by-business', 'businessId');
      if (!operations.indexNames.contains('by-record'))
        operations.createIndex('by-record', 'recordId');
      const periods = database.objectStoreNames.contains(periodStoreName)
        ? transaction.objectStore(periodStoreName)
        : database.createObjectStore(periodStoreName, { keyPath: 'id' });
      if (!periods.indexNames.contains('by-business'))
        periods.createIndex('by-business', 'businessId');
      const metadata = database.objectStoreNames.contains(metadataStoreName)
        ? transaction.objectStore(metadataStoreName)
        : database.createObjectStore(metadataStoreName);
      metadata.put(demoStorageSchemaVersion, 'schemaVersion');
      if (event.oldVersion < 2) {
        defaultDemoBusinessEntityPeriods.forEach((period) =>
          periods.put(structuredClone(period)),
        );
        if (database.objectStoreNames.contains(legacyStoreName)) {
          const legacyRequest = transaction
            .objectStore(legacyStoreName)
            .get(legacyOperationsKey);
          legacyRequest.onsuccess = () => {
            const legacy = Array.isArray(legacyRequest.result)
              ? (legacyRequest.result as LegacyDemoOperation[])
              : [];
            migrateLegacyDemoOperations(legacy).forEach((operation) =>
              operations.put(operation),
            );
          };
        }
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error('Unable to open demo storage.'));
  });
}

async function readAll<T>(storeName: string): Promise<T[]> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, 'readonly');
    const request = transaction.objectStore(storeName).getAll();
    request.onsuccess = () => resolve(request.result as T[]);
    request.onerror = () =>
      reject(request.error ?? new Error('Unable to read demo storage.'));
    transaction.oncomplete = () => database.close();
  });
}

async function operations(): Promise<DemoOperation[]> {
  const result =
    typeof indexedDB === 'undefined'
      ? memoryOperations
      : await readAll<DemoOperation>(operationStoreName);
  return [...result].sort((left, right) =>
    left.createdAt.localeCompare(right.createdAt),
  );
}

export async function demoBusinessEntityPeriods(
  businessId?: string,
): Promise<DemoBusinessEntityPeriod[]> {
  const all =
    typeof indexedDB === 'undefined'
      ? memoryPeriods
      : await readAll<DemoBusinessEntityPeriod>(periodStoreName);
  return structuredClone(
    businessId ? all.filter((period) => period.businessId === businessId) : all,
  ).sort((left, right) =>
    left.effectiveFrom.localeCompare(right.effectiveFrom),
  );
}

async function putOperation(operation: DemoOperation): Promise<void> {
  if (typeof indexedDB === 'undefined') {
    memoryOperations.push(operation);
    return;
  }
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(operationStoreName, 'readwrite');
    transaction.objectStore(operationStoreName).put(operation);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error('Unable to save demo storage.'));
  });
  database.close();
}

async function replacePeriods(next: DemoBusinessEntityPeriod[]): Promise<void> {
  if (typeof indexedDB === 'undefined') {
    memoryPeriods = structuredClone(next);
    return;
  }
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(periodStoreName, 'readwrite');
    const store = transaction.objectStore(periodStoreName);
    store.clear();
    next.forEach((period) => store.put(period));
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error('Unable to save demo periods.'));
  });
  database.close();
}

function visit(
  value: unknown,
  update: (item: Record<string, unknown>) => void,
) {
  if (Array.isArray(value)) {
    value.forEach((item) => visit(item, update));
    return;
  }
  if (!value || typeof value !== 'object') return;
  const object = value as Record<string, unknown>;
  update(object);
  Object.values(object).forEach((item) => visit(item, update));
}

function learnRecordScopes(payload: unknown): void {
  visit(payload, (item) => {
    const id = stringValue(item.id);
    const businessId = stringValue(item.businessId ?? item.business_id);
    if (!id || !businessId) return;
    recordScopes.set(id, {
      businessId,
      legalEntityId:
        stringValue(item.legalEntityId ?? item.legal_entity_id) || null,
    });
  });
}

function itemMatchesScope(
  item: Record<string, unknown>,
  operation: DemoOperation,
): boolean {
  const itemBusinessId = stringValue(item.businessId ?? item.business_id);
  return !itemBusinessId || itemBusinessId === operation.businessId;
}

function applyOperation(
  payload: unknown,
  operation: DemoOperation,
  requestPath: string,
) {
  const requestUrl = new URL(requestPath, origin());
  const requestBusinessId = routeBusinessId(requestUrl.pathname);
  if (
    operation.scope === 'BUSINESS' &&
    requestBusinessId &&
    requestBusinessId !== operation.businessId
  )
    return;
  const requestResource = resourceForPath(requestUrl.pathname);
  const isRestore = operation.resource === 'trash/restore';
  const isTrash = operation.resource === 'trash';
  const crossCutting = crossRecordResources.has(operation.resource);
  if (!crossCutting && requestResource !== operation.resource) return;
  if (
    ['attachments', 'comments'].includes(operation.resource) &&
    requestUrl.searchParams.get('recordId') !== operation.recordId
  )
    return;
  const recordId = operation.recordId ?? operation.id;
  if (Array.isArray((payload as Record<string, unknown>).trash) && isRestore) {
    const trash = (payload as Record<string, unknown>).trash as Array<
      Record<string, unknown>
    >;
    (payload as Record<string, unknown>).trash = trash.filter(
      (item) => item.id !== recordId || !itemMatchesScope(item, operation),
    );
  }
  if (isTrash && requestResource !== 'trash') {
    visit(payload, (item) => {
      for (const [key, value] of Object.entries(item))
        if (Array.isArray(value))
          item[key] = value.filter((child: unknown) => {
            if (!child || typeof child !== 'object') return true;
            const record = child as Record<string, unknown>;
            return (
              stringValue(record.id) !== recordId ||
              !itemMatchesScope(record, operation)
            );
          });
    });
  }
  if (isTrash && operation.method === 'POST' && requestResource === 'trash') {
    const root = payload as Record<string, unknown>;
    const trash = Object.values(root).find(Array.isArray) as
      Array<Record<string, unknown>> | undefined;
    if (trash && !trash.some((item) => stringValue(item.id) === recordId))
      trash.unshift({
        ...operation.body,
        id: recordId,
        businessId: operation.businessId,
        legalEntityId: operation.legalEntityId,
        status: 'TRASHED',
        deletedAt: operation.createdAt,
        deleted_at: operation.createdAt,
      });
  }
  if (operation.method === 'DELETE') {
    visit(payload, (item) => {
      for (const [key, value] of Object.entries(item))
        if (Array.isArray(value))
          item[key] = value.filter((child: unknown) => {
            if (!child || typeof child !== 'object') return true;
            const record = child as Record<string, unknown>;
            return (
              stringValue(record.id) !== recordId ||
              !itemMatchesScope(record, operation)
            );
          });
    });
  }
  visit(payload, (item) => {
    if (stringValue(item.id) !== recordId || !itemMatchesScope(item, operation))
      return;
    if (operation.resource === 'record-status')
      item.status = operation.body.status;
    else if (isTrash) {
      item.status = 'TRASHED';
      item.deletedAt = operation.createdAt;
      item.deleted_at = operation.createdAt;
    } else if (isRestore) {
      if ('deletedAt' in item) item.deletedAt = null;
      if ('deleted_at' in item) item.deleted_at = null;
    } else if (operation.method === 'PUT' || operation.method === 'PATCH')
      Object.assign(item, operation.body);
  });

  if (
    operation.method !== 'POST' ||
    nonCreatingCommands.has(operation.resource) ||
    requestResource !== operation.resource
  )
    return;
  const root = payload as Record<string, unknown>;
  const firstArray = Object.values(root).find(Array.isArray) as
    Array<Record<string, unknown>> | undefined;
  if (!firstArray) return;
  let local: Record<string, unknown> = {
    ...operation.body,
    id: operation.id,
    businessId: operation.businessId,
    legalEntityId: operation.legalEntityId,
    status: operation.body.status ?? 'NEW',
    createdAt: operation.createdAt,
    updatedAt: operation.createdAt,
  };
  if (operation.resource === 'attachments')
    local = {
      ...local,
      originalFilename: operation.body.file,
      mimeType: 'application/octet-stream',
      fileSize: 0,
      createdByEmail: 'browser-local-demo',
      versionNumber: 1,
      isCurrent: true,
      displayRotationDegrees: Number(
        operation.body.displayRotationDegrees ?? 0,
      ),
      downloadUrl: '#local-demo-document',
    };
  if (operation.resource === 'comments')
    local = { ...local, authorEmail: 'browser-local-demo' };
  if (!firstArray.some((item) => item.id === local.id))
    firstArray.unshift(local);
}

export async function applyDemoOverlay<T>(
  payload: T,
  path: string,
): Promise<T> {
  const copy = structuredClone(payload);
  learnRecordScopes(copy);
  const stored = await operations();
  for (const [index, operation] of stored.entries()) {
    if (
      operation.resource === 'trash' &&
      operation.method === 'POST' &&
      stored
        .slice(index + 1)
        .some(
          (later) =>
            later.resource === 'trash/restore' &&
            later.recordId === operation.recordId &&
            later.businessId === operation.businessId,
        )
    )
      continue;
    applyOperation(copy, operation, path);
  }
  const requestPath = new URL(path, origin()).pathname;
  const businessId = routeBusinessId(requestPath);
  if (businessId && requestPath === `/api/businesses/${businessId}`) {
    const root = copy as Record<string, unknown>;
    const seededPeriods = Array.isArray(root.operatingPeriods)
      ? (root.operatingPeriods as Array<Record<string, unknown>>)
      : [];
    const entities = new Map<string, unknown>();
    seededPeriods.forEach((period) => {
      const id = stringValue(period.legalEntityId);
      if (id && period.legalEntity) entities.set(id, period.legalEntity);
    });
    const current = root.currentLegalEntity as
      Record<string, unknown> | null | undefined;
    if (current?.id) entities.set(stringValue(current.id), current);
    const localPeriods = await demoBusinessEntityPeriods(businessId);
    root.operatingPeriods = localPeriods.map((period) => ({
      ...period,
      legalEntity: entities.get(period.legalEntityId) ?? {
        id: period.legalEntityId,
      },
    }));
    const localCurrent = localPeriods.find(
      (period) => period.effectiveTo === null,
    );
    root.currentLegalEntity = localCurrent
      ? (entities.get(localCurrent.legalEntityId) ?? {
          id: localCurrent.legalEntityId,
        })
      : null;
  }
  learnRecordScopes(copy);
  return copy;
}

export async function recordDemoMutation(
  path: string,
  init: RequestInit,
): Promise<Record<string, unknown>> {
  const pathname = new URL(path, origin()).pathname;
  const body = parsedBody(init.body);
  const recordId = recordIdFor(body, pathname);
  const businessId = businessForOperation(pathname, body, recordId);
  const resource = resourceForPath(pathname);
  const accountScoped = accountScopedResources.has(resource);
  if (!accountScoped && !businessId)
    throw new Error(
      'Choose a business before changing demo records. No data was saved.',
    );
  if (resource === 'legal-entity-periods') {
    const legalEntityId = stringValue(body.legalEntityId).trim();
    const effectiveFrom = stringValue(body.effectiveFrom).trim();
    if (!businessId || !legalEntityId || !effectiveFrom)
      throw new Error(
        'Business, legal entity, and effective date are required.',
      );
    return {
      localDemo: true,
      operatingPeriods: await changeDemoBusinessLegalEntity({
        businessId,
        legalEntityId,
        effectiveFrom,
      }),
    };
  }
  const periods = await demoBusinessEntityPeriods();
  const operationId = crypto.randomUUID();
  const operation: DemoOperation = {
    schemaVersion: demoStorageSchemaVersion,
    id: operationId,
    method: (init.method ?? 'POST').toUpperCase(),
    path: pathname,
    resource,
    scope: businessId ? 'BUSINESS' : 'ACCOUNT',
    businessId,
    legalEntityId: businessId
      ? resolveLegalEntity(businessId, body, periods, recordId)
      : null,
    recordId:
      recordId ??
      ((init.method ?? 'POST').toUpperCase() === 'POST' ? operationId : null),
    body,
    createdAt: new Date().toISOString(),
  };
  await putOperation(operation);
  if (operation.businessId)
    recordScopes.set(operation.recordId ?? operation.id, {
      businessId: operation.businessId,
      legalEntityId: operation.legalEntityId,
    });
  return {
    localDemo: true,
    record: { id: operation.id, ...operation.body },
    comment: { id: operation.id, ...operation.body },
    attachment: {
      id: operation.id,
      originalFilename: operation.body.file ?? 'Local demo document',
      mimeType: 'application/octet-stream',
      fileSize: 0,
      createdAt: operation.createdAt,
      versionNumber: 1,
      isCurrent: true,
      displayRotationDegrees: 0,
    },
    retentionSettings: {
      ...operation.body,
      updatedAt: operation.createdAt,
    },
  };
}

function previousDate(value: string): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

export async function changeDemoBusinessLegalEntity(input: {
  businessId: string;
  legalEntityId: string;
  effectiveFrom: string;
}): Promise<DemoBusinessEntityPeriod[]> {
  const effectiveFrom = calendarDate(input.effectiveFrom);
  if (!effectiveFrom || !/^\d{4}-\d{2}-\d{2}$/.test(input.effectiveFrom))
    throw new Error('Effective date must be a valid calendar date.');
  const periods = await demoBusinessEntityPeriods();
  const current = periods.find(
    (period) =>
      period.businessId === input.businessId && period.effectiveTo === null,
  );
  if (!current) throw new Error('The demo business has no current period.');
  if (current.legalEntityId === input.legalEntityId)
    throw new Error('Choose a different legal entity.');
  if (effectiveFrom <= current.effectiveFrom)
    throw new Error('The new period must start after the current period.');
  current.effectiveTo = previousDate(effectiveFrom);
  periods.push({
    id: crypto.randomUUID(),
    businessId: input.businessId,
    legalEntityId: input.legalEntityId,
    effectiveFrom,
    effectiveTo: null,
  });
  await replacePeriods(periods);
  return demoBusinessEntityPeriods(input.businessId);
}

export async function demoStorageSnapshot(): Promise<{
  schemaVersion: number;
  operations: DemoOperation[];
  periods: DemoBusinessEntityPeriod[];
}> {
  return {
    schemaVersion: demoStorageSchemaVersion,
    operations: await operations(),
    periods: await demoBusinessEntityPeriods(),
  };
}

export async function resetDemoData() {
  recordScopes.clear();
  if (typeof indexedDB === 'undefined') {
    memoryOperations = [];
    memoryPeriods = structuredClone(defaultDemoBusinessEntityPeriods);
    return;
  }
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const stores = [
      operationStoreName,
      periodStoreName,
      ...(database.objectStoreNames.contains(legacyStoreName)
        ? [legacyStoreName]
        : []),
    ];
    const transaction = database.transaction(stores, 'readwrite');
    transaction.objectStore(operationStoreName).clear();
    const periods = transaction.objectStore(periodStoreName);
    periods.clear();
    defaultDemoBusinessEntityPeriods.forEach((period) => periods.put(period));
    if (database.objectStoreNames.contains(legacyStoreName))
      transaction.objectStore(legacyStoreName).put([], legacyOperationsKey);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error('Unable to reset demo storage.'));
  });
  database.close();
}
