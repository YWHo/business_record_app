import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  readStaticDemoTable,
  queryStaticDemoRecords,
  staticDemoBusinesses,
  staticDemoDatasetVersion,
  staticDemoStorageName,
} from './staticDemo';
import {
  readStaticDemoBusinesses,
  readStaticDemoRecords,
} from './staticDemoClient';
import { recordDemoMutation, resetDemoData } from './demoStore';

const uber = 'business-demo-activity-rideshare';
const doorDash = 'business-demo-activity-delivery';

describe('static fictional demo baseline and read adapter', () => {
  beforeEach(async () => {
    await resetDemoData();
    vi.stubGlobal(
      'fetch',
      vi.fn(() => {
        throw new Error('Network is forbidden');
      }),
    );
  });

  it('has four fictional businesses with combined Uber services and current legal entities', async () => {
    const { businesses } = await readStaticDemoBusinesses();
    expect(businesses).toHaveLength(4);
    expect(businesses.find((business) => business.id === uber)).toMatchObject({
      name: 'Uber',
      description: 'Uber rides and Uber Eats deliveries',
      currentLegalEntity: { legalName: 'Taxi Limited' },
    });
    expect(businesses.find((business) => business.id === doorDash)?.name).toBe(
      'DoorDash',
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it('returns fresh copies and keeps edits scoped to one business before pagination', async () => {
    const expense = readStaticDemoTable('expenses').find(
      (row) => row.business_id === uber,
    )!;
    await recordDemoMutation(`/api/businesses/${uber}/expenses/${expense.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        description: 'Unique browser-only change',
        purchaseDatetime: expense.purchase_datetime,
        merchantName: expense.merchant_name,
        expenseType: expense.expense_type,
      }),
    });
    const result = await readStaticDemoRecords(uber, 'expenses', {
      search: 'Unique browser-only change',
      pageSize: 1,
    });
    expect(result.resultCount).toBe(1);
    expect(result.records[0].id).toBe(expense.id);
    expect(
      (
        await readStaticDemoRecords(doorDash, 'expenses', {
          search: 'Unique browser-only change',
        })
      ).resultCount,
    ).toBe(0);
    expect(
      readStaticDemoTable('expenses').find((row) => row.id === expense.id)
        ?.description,
    ).not.toContain('Unique');
    await resetDemoData();
    expect(
      (
        await readStaticDemoRecords(uber, 'expenses', {
          search: 'Unique browser-only change',
        })
      ).resultCount,
    ).toBe(0);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('counts and paginates after filtering with stable ordering and no duplicated mileage', () => {
    const first = queryStaticDemoRecords('work_sessions', {
      businessId: uber,
      search: 'Uber Eats',
      pageSize: 3,
    });
    const second = queryStaticDemoRecords('work_sessions', {
      businessId: uber,
      search: 'Uber Eats',
      pageSize: 3,
      page: 2,
    });
    expect(first.resultCount).toBeGreaterThan(3);
    expect(first.page.hasNext).toBe(true);
    expect(
      second.records.every(
        (row) => !first.records.some((other) => other.id === row.id),
      ),
    ).toBe(true);
    const mixed = queryStaticDemoRecords('work_sessions', {
      businessId: uber,
      from: '2026-09-21',
      to: '2026-10-01',
      pageSize: 200,
    });
    expect(
      mixed.records.reduce((sum, row) => sum + Number(row.distanceKm), 0),
    ).toBe(900);
  });

  it('uses Auckland calendar dates for instants and preserves income calendar dates', () => {
    const row = {
      id: 'boundary',
      purchase_datetime: '2026-09-26T12:30:00.000Z',
      transaction_date: '2026-09-26',
    };
    expect(
      queryStaticDemoRecords(
        'expenses',
        { from: '2026-09-27', to: '2026-09-27' },
        [row],
      ).resultCount,
    ).toBe(1);
    expect(
      queryStaticDemoRecords(
        'income_records',
        { from: '2026-09-27', to: '2026-09-27' },
        [row],
      ).resultCount,
    ).toBe(0);
  });

  it.each([
    { page: 0 },
    { pageSize: 201 },
    { page: 1.5 },
    { from: '2026-02-30' },
    { from: '2026-10-02', to: '2026-10-01' },
  ])('rejects invalid query bounds: %j', (query) => {
    expect(() => queryStaticDemoRecords('expenses', query)).toThrow();
  });

  it('never imports authentication state and namespaces storage by dataset version', () => {
    expect(staticDemoStorageName).toContain(staticDemoDatasetVersion);
    expect(staticDemoStorageName).not.toBe('business-records-public-demo');
    const copy = readStaticDemoTable('businesses');
    copy[0].name = 'Changed';
    expect(staticDemoBusinesses()[0].name).toBe('DoorDash');
  });
});
