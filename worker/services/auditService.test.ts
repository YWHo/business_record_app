import { describe, expect, it } from 'vitest';
import type { Env } from '../types';
import { writeAudit } from './auditService';

describe('writeAudit', () => {
  it('persists optional business and legal-entity scope', async () => {
    let sql = '';
    let values: unknown[] = [];
    const statement = {
      bind(...bound: unknown[]) {
        values = bound;
        return statement;
      },
      run: () => Promise.resolve(),
    };
    const env = {
      DB: {
        prepare(query: string) {
          sql = query;
          return statement;
        },
      },
    } as unknown as Env;

    await writeAudit(
      env,
      { id: 'owner-1', businessAccountId: 'account-1' },
      'BUSINESS_UPDATED',
      'BUSINESS',
      'business-1',
      'Business updated.',
      null,
      { name: { before: 'Old', after: 'New' } },
      { businessId: 'business-1', legalEntityId: 'entity-1' },
    );

    expect(sql).toContain('business_id, legal_entity_id');
    expect(values.slice(1, 10)).toEqual([
      'account-1',
      'owner-1',
      'BUSINESS_UPDATED',
      'BUSINESS',
      'business-1',
      null,
      'business-1',
      'entity-1',
      'Business updated.',
    ]);
  });
});
