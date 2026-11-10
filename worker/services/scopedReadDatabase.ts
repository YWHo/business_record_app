import { HttpError } from '../lib/http';
import {
  authorizationScopeJson,
  type AuthorizationContext,
} from './accessControlService';

/** SQL security boundary for restricted read requests. Each original SELECT
 * resolves the same table names to filtered CTEs, including nested queries.
 * main.table is used only inside this trusted prefix, never in caller SQL.
 * This binding is read-only and never used for authentication or mutations.
 */
export function scopedReadDatabase(
  db: D1Database,
  context: AuthorizationContext,
): D1Database {
  const parent = (alias: string) => `(
    (${alias}.record_type='EXPENSE' AND EXISTS (SELECT 1 FROM expenses p WHERE p.id=${alias}.record_id)) OR
    (${alias}.record_type='INCOME' AND EXISTS (SELECT 1 FROM income_records p WHERE p.id=${alias}.record_id)) OR
    (${alias}.record_type='WORK_SESSION' AND EXISTS (SELECT 1 FROM work_sessions p WHERE p.id=${alias}.record_id)))`;
  const grant = (
    business: string,
    entity: string,
    date: string,
    instant = false,
  ) => `EXISTS (
    SELECT 1 FROM _access_grants g WHERE
      (g.kind='ACCOUNT' OR (g.kind='BUSINESS' AND g.business_id=${business}) OR (g.kind='LEGAL_ENTITY' AND g.entity_id=${entity}))
      AND ${
        instant
          ? `julianday(${date}) IS NOT NULL AND date(substr(${date},1,10),'+0 days')=substr(${date},1,10)
      AND (g.instant_from IS NULL OR julianday(${date})>=julianday(g.instant_from))
      AND (g.instant_to IS NULL OR julianday(${date})<julianday(g.instant_to))`
          : `date(${date},'+0 days')=${date} AND (g.date_from IS NULL OR ${date}>=g.date_from) AND (g.date_to IS NULL OR ${date}<=g.date_to)`
      })`;
  const account = `(SELECT account_id FROM _access_context)`;
  const scopePrefix = `WITH
    _access_context AS (SELECT ? AS account_id, ? AS scope_json),
    _access_grants AS (SELECT json_extract(value,'$.scopeType') AS kind,
      json_extract(value,'$.businessId') AS business_id,json_extract(value,'$.legalEntityId') AS entity_id,
      json_extract(value,'$.dateFrom') AS date_from,json_extract(value,'$.dateTo') AS date_to,
      json_extract(value,'$.instantFrom') AS instant_from,json_extract(value,'$.instantTo') AS instant_to
      FROM json_each((SELECT scope_json FROM _access_context))),
    expenses AS (SELECT r.* FROM main.expenses r WHERE r.business_account_id=${account}
      AND ${grant('r.business_id', 'r.legal_entity_id', 'r.purchase_datetime', true)}),
    income_records AS (SELECT r.* FROM main.income_records r WHERE r.business_account_id=${account}
      AND ${grant('r.business_id', 'r.legal_entity_id', 'r.transaction_date')}),
    work_sessions AS (SELECT r.* FROM main.work_sessions r WHERE r.business_account_id=${account}
      AND ${grant('r.business_id', 'r.legal_entity_id', 'r.started_at', true)}),
    business_entity_periods AS (SELECT p.* FROM main.business_entity_periods p WHERE p.business_account_id=${account}
      AND EXISTS (SELECT 1 FROM _access_grants g WHERE
        (g.kind='ACCOUNT' OR (g.kind='BUSINESS' AND g.business_id=p.business_id) OR (g.kind='LEGAL_ENTITY' AND g.entity_id=p.legal_entity_id))
        AND (g.date_from IS NULL OR p.effective_to IS NULL OR p.effective_to>=g.date_from)
        AND (g.date_to IS NULL OR p.effective_from<=g.date_to))),
    businesses AS (SELECT b.* FROM main.businesses b WHERE b.business_account_id=${account}
      AND (EXISTS (SELECT 1 FROM _access_grants g WHERE g.kind='ACCOUNT' OR (g.kind='BUSINESS' AND g.business_id=b.id))
        OR EXISTS (SELECT 1 FROM business_entity_periods p WHERE p.business_id=b.id))),
    business_entities AS (SELECT e.* FROM main.business_entities e WHERE e.business_account_id=${account}
      AND (EXISTS (SELECT 1 FROM _access_grants g WHERE g.kind='ACCOUNT' OR (g.kind='LEGAL_ENTITY' AND g.entity_id=e.id))
        OR EXISTS (SELECT 1 FROM business_entity_periods p WHERE p.legal_entity_id=e.id))),
    business_activities AS (SELECT a.* FROM main.business_activities a WHERE a.business_account_id=${account}
      AND EXISTS (SELECT 1 FROM businesses b WHERE b.legacy_business_activity_id=a.id)),
    attachments AS (SELECT a.* FROM main.attachments a WHERE a.business_account_id=${account} AND ${parent('a')}),
    comments AS (SELECT a.* FROM main.comments a WHERE a.business_account_id=${account} AND ${parent('a')}),
    fuel_expense_details AS (SELECT d.* FROM main.fuel_expense_details d WHERE d.business_account_id=${account} AND EXISTS (SELECT 1 FROM expenses p WHERE p.id=d.expense_id)),
    parking_expense_details AS (SELECT d.* FROM main.parking_expense_details d WHERE d.business_account_id=${account} AND EXISTS (SELECT 1 FROM expenses p WHERE p.id=d.expense_id)),
    insurance_expense_details AS (SELECT d.* FROM main.insurance_expense_details d WHERE d.business_account_id=${account} AND EXISTS (SELECT 1 FROM expenses p WHERE p.id=d.expense_id)),
    expense_allocations AS (SELECT d.* FROM main.expense_allocations d WHERE d.business_account_id=${account} AND EXISTS (SELECT 1 FROM expenses p WHERE p.id=d.expense_id)),
    platform_income_details AS (SELECT d.* FROM main.platform_income_details d WHERE d.business_account_id=${account} AND EXISTS (SELECT 1 FROM income_records p WHERE p.id=d.income_id)),
    contract_income_details AS (SELECT d.* FROM main.contract_income_details d WHERE d.business_account_id=${account} AND EXISTS (SELECT 1 FROM income_records p WHERE p.id=d.income_id)),
    subscription_income_details AS (SELECT d.* FROM main.subscription_income_details d WHERE d.business_account_id=${account} AND EXISTS (SELECT 1 FROM income_records p WHERE p.id=d.income_id)),
    income_reconciliations AS (SELECT d.* FROM main.income_reconciliations d WHERE d.business_account_id=${account} AND EXISTS (SELECT 1 FROM income_records p WHERE p.id=d.income_id)),
    vehicles AS (SELECT v.* FROM main.vehicles v WHERE v.business_account_id=${account} AND (
      v.business_id IN (SELECT id FROM businesses) OR EXISTS (SELECT 1 FROM work_sessions p WHERE p.vehicle_id=v.id)
      OR EXISTS (SELECT 1 FROM fuel_expense_details d WHERE d.vehicle_id=v.id)
      OR EXISTS (SELECT 1 FROM parking_expense_details d WHERE d.vehicle_id=v.id)
      OR EXISTS (SELECT 1 FROM insurance_expense_details d WHERE d.vehicle_id=v.id))),
    clients AS (SELECT c.* FROM main.clients c WHERE c.business_account_id=${account} AND (
      c.business_id IN (SELECT id FROM businesses) OR EXISTS (SELECT 1 FROM contract_income_details d WHERE d.client_id=c.id))),
    expense_categories AS (SELECT c.* FROM main.expense_categories c WHERE c.business_account_id=${account} AND (
      c.business_id IN (SELECT id FROM businesses) OR EXISTS (SELECT 1 FROM expenses p WHERE p.expense_category_id=c.id))),
    audit_log AS (SELECT a.* FROM main.audit_log a WHERE a.business_account_id=${account} AND (
      (a.entity_type IN ('EXPENSE','INCOME','WORK_SESSION') AND EXISTS (SELECT 1 FROM _access_grants g
        WHERE g.date_from IS NULL AND g.date_to IS NULL AND (g.kind='ACCOUNT'
          OR (g.kind='BUSINESS' AND g.business_id=a.business_id) OR (g.kind='LEGAL_ENTITY' AND g.entity_id=a.legal_entity_id)))) OR
      (a.entity_type='EXPENSE' AND EXISTS (SELECT 1 FROM expenses p WHERE p.id=a.entity_id AND (a.business_id IS NULL OR a.business_id=p.business_id) AND (a.legal_entity_id IS NULL OR a.legal_entity_id=p.legal_entity_id))) OR
      (a.entity_type='INCOME' AND EXISTS (SELECT 1 FROM income_records p WHERE p.id=a.entity_id AND (a.business_id IS NULL OR a.business_id=p.business_id) AND (a.legal_entity_id IS NULL OR a.legal_entity_id=p.legal_entity_id))) OR
      (a.entity_type='WORK_SESSION' AND EXISTS (SELECT 1 FROM work_sessions p WHERE p.id=a.entity_id AND (a.business_id IS NULL OR a.business_id=p.business_id) AND (a.legal_entity_id IS NULL OR a.legal_entity_id=p.legal_entity_id))) OR
      (a.entity_type IN ('BUSINESS','LEGAL_ENTITY','BUSINESS_ENTITY_PERIOD')
        AND ${grant('a.business_id', 'a.legal_entity_id', 'a.created_at', true)})
    )) `;
  const prefixBindings = [
    context.businessAccountId,
    authorizationScopeJson(context),
  ];
  return new Proxy(db, {
    get(_target, property) {
      if (property !== 'prepare')
        return () => {
          throw new HttpError(
            403,
            'This database binding permits scoped reads only.',
          );
        };
      return (sql: string) => {
        // Reject statements that could override the CTEs, address physical
        // tables, inspect schema, or perform a second operation.
        if (
          !/^\s*SELECT\b/i.test(sql) ||
          /;|\b(?:main|temp|sqlite_master|sqlite_schema)\b|\?[0-9]/i.test(sql)
        ) {
          throw new HttpError(
            403,
            'This query is unavailable to restricted access.',
          );
        }
        const statement = db.prepare(scopePrefix + sql);
        const wrap = (values: unknown[]): D1PreparedStatement =>
          new Proxy(statement.bind(...prefixBindings, ...values), {
            get(target, key) {
              if (key === 'bind') return (...next: unknown[]) => wrap(next);
              const value: unknown = Reflect.get(target, key);
              return typeof value === 'function'
                ? (value.bind(target) as unknown)
                : value;
            },
          });
        return wrap([]);
      };
    },
  });
}
