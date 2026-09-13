type DemoOperation = {
  id: string;
  method: string;
  path: string;
  body: Record<string, unknown>;
  createdAt: string;
};

const databaseName = 'business-records-public-demo';
const storeName = 'overlay';
const operationsKey = 'operations';
let memoryOperations: DemoOperation[] = [];

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(storeName);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error('Unable to open demo storage.'));
  });
}

async function operations(): Promise<DemoOperation[]> {
  if (typeof indexedDB === 'undefined') return memoryOperations;
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, 'readonly');
    const request = transaction.objectStore(storeName).get(operationsKey);
    request.onsuccess = () =>
      resolve((request.result as DemoOperation[]) ?? []);
    request.onerror = () =>
      reject(request.error ?? new Error('Unable to read demo storage.'));
    transaction.oncomplete = () => database.close();
  });
}

async function save(next: DemoOperation[]) {
  if (typeof indexedDB === 'undefined') {
    memoryOperations = next;
    return;
  }
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(storeName, 'readwrite');
    transaction.objectStore(storeName).put(next, operationsKey);
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () =>
      reject(transaction.error ?? new Error('Unable to save demo storage.'));
  });
}

function parsedBody(body: BodyInit | null | undefined) {
  if (typeof body === 'string') {
    try {
      return JSON.parse(body) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  if (body instanceof FormData) {
    const result: Record<string, unknown> = {};
    for (const [key, value] of body.entries())
      result[key] = value instanceof File ? value.name : value;
    return result;
  }
  return {};
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

function stringValue(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number'
    ? String(value)
    : '';
}

function applyOperation(
  payload: unknown,
  operation: DemoOperation,
  requestPath: string,
) {
  const segments = operation.path.split('/').filter(Boolean);
  const resourceId = segments.length > 2 ? segments.at(-1) : undefined;
  const recordId = stringValue(
    operation.body.recordId ?? operation.body.id ?? resourceId,
  );
  const isRestore = operation.path === '/api/trash/restore';
  const isTrash = operation.path === '/api/trash';
  const crossCutting =
    operation.path === '/api/record-status' || isRestore || isTrash;
  const operationRoot = `/${segments.slice(0, 2).join('/')}`;
  const requestUrl = new URL(requestPath, window.location.origin);
  if (!crossCutting && requestUrl.pathname !== operationRoot) return;
  if (
    ['/api/attachments', '/api/comments'].includes(operation.path) &&
    requestUrl.searchParams.get('recordId') !== operation.body.recordId
  )
    return;
  if (Array.isArray((payload as Record<string, unknown>).trash) && isRestore) {
    const trash = (payload as Record<string, unknown>).trash as Array<
      Record<string, unknown>
    >;
    (payload as Record<string, unknown>).trash = trash.filter(
      (item) => String(item.id) !== recordId,
    );
  }
  if (isTrash && requestUrl.pathname !== '/api/trash') {
    visit(payload, (item) => {
      for (const [key, value] of Object.entries(item))
        if (Array.isArray(value))
          item[key] = value.filter((child: unknown) => {
            if (!child || typeof child !== 'object') return true;
            return (
              stringValue((child as Record<string, unknown>).id) !== recordId
            );
          });
    });
  }
  if (operation.method === 'DELETE') {
    visit(payload, (item) => {
      for (const [key, value] of Object.entries(item))
        if (Array.isArray(value))
          item[key] = value.filter((child: unknown) => {
            if (!child || typeof child !== 'object') return true;
            return (
              stringValue((child as Record<string, unknown>).id) !== recordId
            );
          });
    });
  }
  visit(payload, (item) => {
    if (stringValue(item.id) !== recordId) return;
    if (operation.path === '/api/record-status')
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
    segments.length !== 2 ||
    requestUrl.pathname !== operationRoot
  )
    return;
  const root = payload as Record<string, unknown>;
  const firstArray = Object.values(root).find(Array.isArray) as
    Array<Record<string, unknown>> | undefined;
  if (firstArray) {
    let local: Record<string, unknown> = {
      ...operation.body,
      id: operation.id,
      status: operation.body.status ?? 'NEW',
      createdAt: operation.createdAt,
      updatedAt: operation.createdAt,
    };
    if (operation.path === '/api/attachments')
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
    if (operation.path === '/api/comments')
      local = { ...local, authorEmail: 'browser-local-demo' };
    if (!firstArray.some((item) => item.id === local.id))
      firstArray.unshift(local);
  }
}

export async function applyDemoOverlay<T>(
  payload: T,
  path: string,
): Promise<T> {
  const copy = structuredClone(payload);
  const stored = await operations();
  for (const [index, operation] of stored.entries()) {
    if (
      operation.path === '/api/trash' &&
      stored
        .slice(index + 1)
        .some(
          (later) =>
            later.path === '/api/trash/restore' &&
            later.body.recordId === operation.body.recordId,
        )
    )
      continue;
    applyOperation(copy, operation, path);
  }
  return copy;
}

export async function recordDemoMutation(
  path: string,
  init: RequestInit,
): Promise<Record<string, unknown>> {
  const operation: DemoOperation = {
    id: crypto.randomUUID(),
    method: (init.method ?? 'POST').toUpperCase(),
    path: new URL(path, window.location.origin).pathname,
    body: parsedBody(init.body),
    createdAt: new Date().toISOString(),
  };
  await save([...(await operations()), operation]);
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

export async function resetDemoData() {
  await save([]);
}
