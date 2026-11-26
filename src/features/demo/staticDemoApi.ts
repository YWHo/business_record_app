import { ApiError } from '../../lib/apiError';
import {
  hasPermission,
  type Permission,
  type PermissionRole,
} from '../../lib/permissions';
import { recordDemoMutation } from './demoStore';
import { readStaticDemoTable } from './staticDemo';
import { readStaticDemoBusinesses } from './staticDemoClient';
import {
  readStaticDemoDetail,
  readStaticDemoDetailCollection,
} from './staticDemoDetails';
import { readStaticDemoDashboard } from './staticDemoDashboard';
import {
  readStaticDemoDocuments,
  readStaticDemoAttachments,
} from './staticDemoEvidence';
import {
  readStaticDemoAudit,
  readStaticDemoComments,
  readStaticDemoSavedFilters,
} from './staticDemoHistory';
import {
  readStaticDemoExportStatus,
  readStaticDemoTrash,
} from './staticDemoGovernance';
import {
  readStaticDemoBusinessDetails,
  readStaticDemoLegalEntities,
  readStaticDemoReferences,
  readStaticDemoRetentionSettings,
} from './staticDemoReferences';
import { readStaticDemoReport } from './staticDemoReports';
import { readStaticDemoTransactions } from './staticDemoTransactions';
import { summarizeWorkSessions } from '../../../worker/services/workSessionService';

type Collection = 'expenses' | 'income' | 'work-sessions';
type Row = Record<string, unknown>;
const collectionProperties = {
  expenses: 'expenses',
  income: 'incomeRecords',
  'work-sessions': 'sessions',
} as const;
const detailProperties = {
  expenses: 'expense',
  income: 'incomeRecord',
  'work-sessions': 'session',
} as const;
const recordCollections = {
  EXPENSE: 'expenses',
  INCOME: 'income',
  WORK_SESSION: 'work-sessions',
} as const;

function denied(
  message = 'This operation is unavailable in the public demo.',
): never {
  throw new ApiError(403, { error: message });
}
function requirePermission(role: PermissionRole, permission: Permission) {
  if (!hasPermission({ role }, permission)) {
    denied('This demo role cannot perform that operation.');
  }
}
function recordType(value: unknown): keyof typeof recordCollections {
  if (value !== 'EXPENSE' && value !== 'INCOME' && value !== 'WORK_SESSION') {
    throw new ApiError(400, { error: 'Invalid record type.' });
  }
  return value;
}
async function parentBusiness(collection: Collection, recordId: string) {
  for (const business of readStaticDemoTable('businesses')) {
    if (
      (
        await readStaticDemoDetailCollection(String(business.id), collection)
      ).some((row) => row.id === recordId)
    ) {
      return String(business.id);
    }
  }
  throw new ApiError(404, { error: 'Demo record not found.' });
}

async function collectionResponse(businessId: string, collection: Collection) {
  const dateField =
    collection === 'expenses'
      ? 'purchaseDatetime'
      : collection === 'income'
        ? 'transactionDate'
        : 'startedAt';
  const rows = (await readStaticDemoDetailCollection(businessId, collection))
    .sort(
      (a, b) =>
        String(b[dateField]).localeCompare(String(a[dateField])) ||
        String(b.id).localeCompare(String(a.id)),
    )
    .slice(0, 200);
  if (collection === 'work-sessions') {
    const sessions = await Promise.all(
      rows.map((row) =>
        readStaticDemoDetail(businessId, collection, String(row.id)),
      ),
    );
    return {
      sessions,
      summary: summarizeWorkSessions(
        sessions.map((row) => ({
          started_at: String(row.startedAt),
          ended_at: String(row.endedAt),
          distance_km: Number(row.distanceKm),
          gross_revenue_minor:
            typeof row.grossRevenueMinor === 'number'
              ? row.grossRevenueMinor
              : null,
          currency: String(row.currency),
        })),
      ),
    };
  }
  return { [collectionProperties[collection]]: rows };
}

async function read(
  path: string,
  query: URLSearchParams,
  role: PermissionRole,
): Promise<unknown> {
  const business = path.match(/^\/api\/businesses\/([^/]+)(?:\/(.*))?$/);
  if (business) {
    const businessId = decodeURIComponent(business[1]);
    const resource = business[2] ?? '';
    if (
      !readStaticDemoTable('businesses').some((row) => row.id === businessId)
    ) {
      throw new ApiError(404, { error: 'Demo business not found.' });
    }
    if (!resource) {
      return readStaticDemoBusinessDetails(businessId);
    }
    if (resource === 'documents') {
      return readStaticDemoDocuments(businessId);
    }
    if (resource === 'dashboard') {
      return readStaticDemoDashboard(businessId, query);
    }
    if (resource === 'transactions' || resource === 'receipts') {
      return readStaticDemoTransactions(businessId, query);
    }
    const record = resource.match(
      /^(expenses|income|work-sessions)(?:\/([^/]+))?$/,
    );
    if (record) {
      const collection = record[1] as Collection;
      return record[2]
        ? {
            [detailProperties[collection]]: await readStaticDemoDetail(
              businessId,
              collection,
              decodeURIComponent(record[2]),
            ),
          }
        : collectionResponse(businessId, collection);
    }
    denied();
  }
  switch (path) {
    case '/api/businesses':
      return readStaticDemoBusinesses();
    case '/api/business-activities':
      return readStaticDemoReferences('activities');
    case '/api/vehicles':
      return readStaticDemoReferences('vehicles');
    case '/api/clients':
      return readStaticDemoReferences('clients');
    case '/api/expense-categories':
      return readStaticDemoReferences('categories');
    case '/api/legal-entities':
      return readStaticDemoLegalEntities();
    case '/api/fuel-records': {
      const expenses = (
        await Promise.all(
          readStaticDemoTable('businesses').map((business) =>
            readStaticDemoDetailCollection(String(business.id), 'expenses'),
          ),
        )
      ).flat();
      const activities = readStaticDemoTable('business_activities');
      return {
        fuelRecords: expenses
          .filter((row) => row.expenseType === 'FUEL')
          .sort((a, b) =>
            String(b.purchaseDatetime).localeCompare(
              String(a.purchaseDatetime),
            ),
          )
          .slice(0, 200)
          .map((row) => ({
            ...row,
            activityName:
              activities.find(
                (activity) => activity.id === row.businessActivityId,
              )?.name ?? null,
          })),
      };
    }
    case '/api/dashboard':
      return readStaticDemoDashboard(undefined, query);
    case '/api/transactions':
      return readStaticDemoTransactions(undefined, query);
    case '/api/receipts':
      return readStaticDemoTransactions(undefined, query);
    case '/api/reports/summary':
      return readStaticDemoReport(query);
    case '/api/audit-log':
      return readStaticDemoAudit(query, role);
    case '/api/saved-filters':
      requirePermission(role, 'FILTER_MANAGE');
      return readStaticDemoSavedFilters(
        (query.get('filterType') ?? undefined) as
          'TRANSACTIONS' | 'RECEIPTS' | 'AUDIT' | undefined,
        role,
      );
    case '/api/retention-settings':
      requirePermission(role, 'RETENTION_VIEW');
      return readStaticDemoRetentionSettings();
    case '/api/exports/status':
      requirePermission(role, 'ARCHIVE_HISTORY_VIEW');
      return readStaticDemoExportStatus();
    case '/api/trash':
      requirePermission(role, 'RETENTION_MANAGE');
      return readStaticDemoTrash();
    case '/api/comments':
    case '/api/attachments': {
      const type = recordType(query.get('recordType'));
      const id = query.get('recordId') ?? '';
      const businessId = await parentBusiness(recordCollections[type], id);
      return path === '/api/comments'
        ? readStaticDemoComments(businessId, type, id)
        : readStaticDemoAttachments(businessId, type, id);
    }
    default:
      denied();
  }
}

function mutationPermission(path: string, method: string): Permission {
  if (method === 'POST' && path === '/api/comments') {
    return 'COMMENT_CREATE';
  }
  if (method === 'PATCH' && path === '/api/record-status') {
    return 'REVIEW_UPDATE';
  }
  if (
    method === 'POST' &&
    ['/api/income-reconciliations', '/api/insurance-allocations'].includes(path)
  ) {
    return 'ACCOUNTING_ADJUST';
  }
  if (['POST', 'DELETE'].includes(method) && path === '/api/saved-filters') {
    return 'FILTER_MANAGE';
  }
  if (method === 'POST' && path === '/api/attachments') {
    return 'ATTACHMENT_UPLOAD';
  }
  if (method === 'PATCH' && path === '/api/attachments/rotation') {
    return 'ATTACHMENT_UPLOAD';
  }
  if (
    method === 'POST' &&
    ['/api/trash', '/api/trash/restore'].includes(path)
  ) {
    return 'RECORD_DELETE';
  }
  if (method === 'PATCH' && path === '/api/retention-settings') {
    return 'RETENTION_MANAGE';
  }
  if (
    ['POST', 'PATCH'].includes(method) &&
    /^\/api\/(business-activities|vehicles|clients|expense-categories)$/.test(
      path,
    )
  ) {
    return 'BUSINESS_MANAGE';
  }
  if (
    method === 'POST' &&
    /^\/api\/businesses\/[^/]+\/legal-entity-periods$/.test(path)
  ) {
    return 'ENTITY_MANAGE';
  }
  if (method === 'PATCH' && /^\/api\/businesses\/[^/]+$/.test(path)) {
    return 'BUSINESS_MANAGE';
  }
  if (
    method === 'PATCH' &&
    /^\/api\/businesses\/[^/]+\/work-sessions\/[^/]+\/fuel-workflow$/.test(path)
  ) {
    return 'RECORD_EDIT';
  }
  if (
    method === 'POST' &&
    /^\/api\/businesses\/[^/]+\/(expenses|income|work-sessions)$/.test(path)
  ) {
    return 'RECORD_CREATE';
  }
  if (
    method === 'PATCH' &&
    /^\/api\/businesses\/[^/]+\/(expenses|income|work-sessions)\/[^/]+$/.test(
      path,
    )
  ) {
    return 'RECORD_EDIT';
  }
  denied();
}

// Explicit dispatch only: unsupported endpoints never fall back to fetch.
export async function staticDemoRequest(
  path: string,
  init: RequestInit | undefined,
  role: PermissionRole | null,
): Promise<unknown> {
  if (!role || !['OWNER', 'ACCOUNTANT', 'AUDITOR'].includes(role)) {
    denied('Choose a demo role before opening records.');
  }
  const url = new URL(path, 'https://static-demo.invalid');
  if (
    !path.startsWith('/api/') ||
    url.origin !== 'https://static-demo.invalid' ||
    url.hash
  ) {
    denied();
  }
  const method = (init?.method ?? 'GET').toUpperCase();
  if (method === 'GET' || method === 'HEAD') {
    return read(url.pathname, url.searchParams, role);
  }
  if (role === 'AUDITOR') {
    denied('This demo role is read-only. Changes are unavailable.');
  }
  requirePermission(role, mutationPermission(url.pathname, method));
  if (
    ['/api/income-reconciliations', '/api/insurance-allocations'].includes(
      url.pathname,
    ) &&
    role !== 'ACCOUNTANT'
  ) {
    denied('This accounting workflow is available to the demo accountant.');
  }
  const scoped = url.pathname.match(
    /^\/api\/businesses\/([^/]+)(?:\/(expenses|income|work-sessions)(?:\/([^/]+))?)?/,
  );
  if (scoped) {
    await readStaticDemoBusinessDetails(decodeURIComponent(scoped[1]));
    if (scoped[2] && scoped[3]) {
      await readStaticDemoDetail(
        decodeURIComponent(scoped[1]),
        scoped[2] as Collection,
        decodeURIComponent(scoped[3]),
      );
    }
  }
  const result = await recordDemoMutation(url.pathname, init ?? {});
  const record = url.pathname.match(
    /^\/api\/businesses\/([^/]+)\/(expenses|income|work-sessions)(?:\/([^/]+))?$/,
  );
  if (record) {
    const collection = record[2] as Collection;
    const id = record[3]
      ? decodeURIComponent(record[3])
      : String((result.record as Row).id);
    return {
      localDemo: true,
      [detailProperties[collection]]: await readStaticDemoDetail(
        decodeURIComponent(record[1]),
        collection,
        id,
      ),
    };
  }
  return result;
}
