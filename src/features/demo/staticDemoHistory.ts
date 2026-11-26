import dataset from './staticDemoDataset.json';
import { readStaticDemoTable } from './staticDemo';
import { applyDemoOverlay, demoStorageSnapshot } from './demoStore';
import { readStaticDemoDetail } from './staticDemoDetails';
import { requestPagination, pageResult } from '../../../worker/lib/pagination';

type Row = Record<string, unknown>;
type DemoRole = 'OWNER' | 'ACCOUNTANT' | 'AUDITOR';
const collections = {
  EXPENSE: 'expenses',
  INCOME: 'income',
  WORK_SESSION: 'work-sessions',
} as const;

function parsedObject(value: unknown): Row | null {
  if (typeof value !== 'string' || !value) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Row)
      : null;
  } catch {
    return null;
  }
}
function validateDate(value: string | null) {
  if (
    value &&
    (!/^\d{4}-\d{2}-\d{2}$/.test(value) ||
      !Number.isFinite(Date.parse(value)) ||
      new Date(value).toISOString().slice(0, 10) !== value)
  ) {
    throw new Error('Invalid audit date.');
  }
}

export async function readStaticDemoComments(
  businessId: string,
  recordType: keyof typeof collections,
  recordId: string,
) {
  if (!Object.hasOwn(collections, recordType)) {
    throw new Error('Invalid record type.');
  }
  await readStaticDemoDetail(businessId, collections[recordType], recordId);
  const comments: Row[] = readStaticDemoTable('comments')
    .filter(
      (row) =>
        row.business_id === businessId &&
        row.record_type === recordType &&
        row.record_id === recordId,
    )
    .map((row) => {
      const actor = dataset.actors.find((actor) => actor.id === row.author_id);
      return {
        id: row.id,
        recordType: row.record_type,
        recordId: row.record_id,
        message: row.message,
        createdAt: row.created_at,
        authorId: row.author_id,
        authorEmail: actor?.email ?? 'unknown@demo.invalid',
        authorRole: actor?.role ?? '',
      };
    });
  const result = await applyDemoOverlay(
    { comments },
    `/api/comments?recordType=${recordType}&recordId=${encodeURIComponent(recordId)}`,
  );
  return {
    comments: result.comments
      .map((row): Row => ({
        ...row,
        authorId: row.authorId ?? 'browser-local-demo',
        authorRole: row.authorRole ?? 'DEMO',
      }))
      .sort(
        (a, b) =>
          String(a.createdAt).localeCompare(String(b.createdAt)) ||
          String(a.id).localeCompare(String(b.id)),
      )
      .slice(0, 200),
  };
}

export async function readStaticDemoAudit(
  query = new URLSearchParams(),
  role: DemoRole = 'OWNER',
) {
  if (!['OWNER', 'ACCOUNTANT', 'AUDITOR'].includes(role)) {
    throw new Error('Invalid demo role.');
  }
  const pagination = requestPagination(
    new URL(`https://demo.invalid/?${query}`),
  );
  const from = query.get('dateFrom')?.trim() || null;
  const to = query.get('dateTo')?.trim() || null;
  validateDate(from);
  validateDate(to);
  const businessId = query.get('businessId')?.trim();
  const events: Row[] = readStaticDemoTable('audit_log').map((row) => ({
    id: row.id,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    businessId: row.business_id,
    businessActivityId: row.business_activity_id,
    activityName:
      readStaticDemoTable('business_activities').find(
        (activity) => activity.id === row.business_activity_id,
      )?.name ?? null,
    summary: row.summary,
    changedFields: parsedObject(row.changed_fields_json),
    createdAt: row.created_at,
    userId: row.user_id,
    userEmail:
      dataset.actors.find((actor) => actor.id === row.user_id)?.email ??
      'unknown@demo.invalid',
  }));
  for (const operation of (await demoStorageSnapshot()).operations) {
    const resourceTypes: Record<string, string> = {
      expenses: 'EXPENSE',
      'income-records': 'INCOME',
      'work-sessions': 'WORK_SESSION',
      'income-reconciliations': 'INCOME',
      'insurance-allocations': 'EXPENSE',
      'work-sessions/fuel-workflow': 'WORK_SESSION',
    };
    const entityType =
      resourceTypes[operation.resource] ??
      operation.body.recordType ??
      'DEMO_CONFIGURATION';
    events.push({
      id: `browser-${operation.id}`,
      action: 'BROWSER_LOCAL_CHANGE',
      entityType,
      entityId:
        operation.recordId ??
        operation.body.incomeId ??
        operation.body.expenseId ??
        null,
      businessId: operation.businessId,
      businessActivityId: operation.body.businessActivityId ?? null,
      activityName: null,
      summary: `Browser-local ${operation.method} ${operation.resource}; simulated change, not server audit evidence.`,
      changedFields: null,
      createdAt: operation.createdAt,
      userId: 'browser-local-demo',
      userEmail: 'browser-local-demo',
    });
  }
  const filtered = events
    .filter((row) => {
      if (businessId && row.businessId !== businessId) {
        return false;
      }
      if (
        role === 'AUDITOR' &&
        !['EXPENSE', 'INCOME', 'WORK_SESSION'].includes(String(row.entityType))
      ) {
        return false;
      }
      for (const [parameter, key] of Object.entries({
        userId: 'userId',
        action: 'action',
        entityType: 'entityType',
        activityId: 'businessActivityId',
      })) {
        const value = query.get(parameter)?.trim();
        if (value && row[key] !== value) {
          return false;
        }
      }
      const date = String(row.createdAt).slice(0, 10);
      return !(from && date < from) && !(to && date > to);
    })
    .sort(
      (a, b) =>
        String(b.createdAt).localeCompare(String(a.createdAt)) ||
        String(b.id).localeCompare(String(a.id)),
    );
  const page = pageResult(
    filtered.slice(pagination.offset, pagination.offset + pagination.limit),
    pagination,
  );
  return {
    auditEvents: page.items.map((row) => {
      const copy = { ...row };
      delete copy.businessId;
      return copy;
    }),
    page: page.page,
  };
}

export async function readStaticDemoSavedFilters(
  filterType?: 'TRANSACTIONS' | 'RECEIPTS' | 'AUDIT',
  role: DemoRole = 'OWNER',
) {
  if (!['OWNER', 'ACCOUNTANT', 'AUDITOR'].includes(role)) {
    throw new Error('Invalid demo role.');
  }
  if (
    filterType &&
    !['TRANSACTIONS', 'RECEIPTS', 'AUDIT'].includes(filterType)
  ) {
    throw new Error('Invalid saved filter type.');
  }
  const actorId =
    role === 'OWNER'
      ? 'demo-owner'
      : role === 'ACCOUNTANT'
        ? 'demo-accountant'
        : 'browser-demo-auditor';
  const savedFilters: Row[] = readStaticDemoTable('saved_filters')
    .filter((row) => row.user_id === actorId)
    .map((row) => ({
      id: row.id,
      name: row.name,
      filterType: row.filter_type,
      criteria: parsedObject(row.criteria_json),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  const result = await applyDemoOverlay({ savedFilters }, '/api/saved-filters');
  return {
    savedFilters: result.savedFilters
      .filter((row) => !filterType || row.filterType === filterType)
      .sort((a, b) =>
        String(a.name)
          .toLowerCase()
          .localeCompare(String(b.name).toLowerCase()),
      )
      .slice(0, 100),
  };
}
