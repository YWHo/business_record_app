import { beforeEach, describe, expect, it } from 'vitest';
import {
  applyDemoOverlay,
  demoBusinessEntityPeriods,
  demoStorageSchemaVersion,
  demoStorageSnapshot,
  migrateLegacyDemoOperations,
  recordDemoMutation,
  resetDemoData,
} from './demoStore';

describe('browser-local public demo overlay', () => {
  beforeEach(() => resetDemoData());

  it('retains local creates and removes them on reset', async () => {
    await recordDemoMutation('/api/clients', {
      method: 'POST',
      body: JSON.stringify({ name: 'Browser-only client', active: true }),
    });
    const changed = await applyDemoOverlay(
      { clients: [{ id: 'seed', name: 'Seed client' }] },
      '/api/clients',
    );
    expect(changed.clients).toHaveLength(2);
    expect(changed.clients[0]).toMatchObject({
      name: 'Browser-only client',
    });

    await resetDemoData();
    await expect(
      applyDemoOverlay(
        { clients: [{ id: 'seed', name: 'Seed client' }] },
        '/api/clients',
      ),
    ).resolves.toEqual({ clients: [{ id: 'seed', name: 'Seed client' }] });
  });

  it('applies status changes without changing the immutable seed object', async () => {
    const seed = {
      records: [
        {
          id: 'income-1',
          businessId: 'business-demo-activity-rideshare',
          legalEntityId: 'demo-entity-taxi-limited',
          status: 'NEW',
        },
      ],
    };
    await applyDemoOverlay(seed, '/api/transactions');
    await recordDemoMutation('/api/record-status', {
      method: 'PATCH',
      body: JSON.stringify({
        recordId: 'income-1',
        businessId: 'business-demo-activity-rideshare',
        status: 'READY_FOR_REVIEW',
      }),
    });
    const changed = await applyDemoOverlay(seed, '/api/transactions');
    expect(changed.records[0].status).toBe('READY_FOR_REVIEW');
    expect(seed.records[0].status).toBe('NEW');
  });

  it('uses tombstones without deleting seed records and can restore them', async () => {
    const seed = {
      records: [
        {
          id: 'expense-1',
          businessId: 'business-demo-activity-delivery',
          legalEntityId: 'business-entity-primary',
          status: 'REVIEWED',
        },
      ],
    };
    await applyDemoOverlay(seed, '/api/transactions');
    await recordDemoMutation('/api/trash', {
      method: 'POST',
      body: JSON.stringify({
        recordId: 'expense-1',
        businessId: 'business-demo-activity-delivery',
        recordType: 'EXPENSE',
      }),
    });
    await expect(applyDemoOverlay(seed, '/api/transactions')).resolves.toEqual({
      records: [],
    });
    await expect(
      applyDemoOverlay({ trash: [] }, '/api/trash'),
    ).resolves.toMatchObject({
      trash: [
        {
          id: 'expense-1',
          businessId: 'business-demo-activity-delivery',
          status: 'TRASHED',
        },
      ],
    });
    expect(seed.records).toHaveLength(1);

    await recordDemoMutation('/api/trash/restore', {
      method: 'POST',
      body: JSON.stringify({
        recordId: 'expense-1',
        businessId: 'business-demo-activity-delivery',
        recordType: 'EXPENSE',
      }),
    });
    await expect(applyDemoOverlay(seed, '/api/transactions')).resolves.toEqual(
      seed,
    );
  });

  it('keeps child comments isolated to their parent record', async () => {
    await recordDemoMutation('/api/comments', {
      method: 'POST',
      body: JSON.stringify({
        businessId: 'business-demo-activity-delivery',
        recordId: 'expense-1',
        body: 'Browser-only note',
      }),
    });

    await expect(
      applyDemoOverlay({ comments: [] }, '/api/comments?recordId=expense-1'),
    ).resolves.toMatchObject({
      comments: [
        {
          businessId: 'business-demo-activity-delivery',
          recordId: 'expense-1',
          body: 'Browser-only note',
        },
      ],
    });
    await expect(
      applyDemoOverlay({ comments: [] }, '/api/comments?recordId=expense-2'),
    ).resolves.toEqual({ comments: [] });
  });

  it('isolates local creates by route business and resolves legal entity by date', async () => {
    await recordDemoMutation(
      '/api/businesses/business-demo-activity-rideshare/expenses',
      {
        method: 'POST',
        body: JSON.stringify({
          merchantName: 'Local ride expense',
          purchaseDatetime: '2026-07-02T10:00:00.000+12:00',
        }),
      },
    );
    const ride = await applyDemoOverlay(
      { expenses: [] },
      '/api/businesses/business-demo-activity-rideshare/expenses',
    );
    const delivery = await applyDemoOverlay(
      { expenses: [] },
      '/api/businesses/business-demo-activity-delivery/expenses',
    );

    expect(ride.expenses).toHaveLength(1);
    expect(ride.expenses[0]).toMatchObject({
      businessId: 'business-demo-activity-rideshare',
      legalEntityId: 'demo-entity-taxi-limited',
    });
    expect(delivery.expenses).toEqual([]);
    await expect(demoStorageSnapshot()).resolves.toMatchObject({
      schemaVersion: demoStorageSchemaVersion,
      operations: [
        {
          schemaVersion: demoStorageSchemaVersion,
          scope: 'BUSINESS',
          businessId: 'business-demo-activity-rideshare',
          legalEntityId: 'demo-entity-taxi-limited',
        },
      ],
    });
  });

  it('migrates resolvable version-one operations and discards ambiguous ones', () => {
    const migrated = migrateLegacyDemoOperations([
      {
        id: 'compatible',
        method: 'POST',
        path: '/api/general-expenses',
        body: {
          businessActivityId: 'demo-activity-delivery',
          purchaseDatetime: '2026-05-01T10:00:00.000+12:00',
        },
        createdAt: '2026-05-01T00:00:00.000Z',
      },
      {
        id: 'ambiguous',
        method: 'PATCH',
        path: '/api/record-status',
        body: { recordId: 'unknown-record', status: 'REVIEWED' },
        createdAt: '2026-05-01T00:00:01.000Z',
      },
    ]);

    expect(migrated).toHaveLength(1);
    expect(migrated[0]).toMatchObject({
      id: 'compatible',
      businessId: 'business-demo-activity-delivery',
      legalEntityId: 'business-entity-primary',
    });
  });

  it('keeps period changes local and restores seed periods on reset', async () => {
    await recordDemoMutation(
      '/api/businesses/business-demo-activity-delivery/legal-entity-periods',
      {
        method: 'POST',
        body: JSON.stringify({
          legalEntityId: 'demo-entity-taxi-limited',
          effectiveFrom: '2027-04-01',
        }),
      },
    );
    const changed = await demoBusinessEntityPeriods(
      'business-demo-activity-delivery',
    );
    expect(changed).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          legalEntityId: 'business-entity-primary',
          effectiveTo: '2027-03-31',
        }),
        expect.objectContaining({
          legalEntityId: 'demo-entity-taxi-limited',
          effectiveFrom: '2027-04-01',
          effectiveTo: null,
        }),
      ]),
    );
    const directory = await applyDemoOverlay(
      {
        businesses: [
          {
            id: 'business-demo-activity-delivery',
            currentLegalEntity: {
              id: 'business-entity-primary',
              legalName: 'Brian Ho',
            },
          },
          {
            id: 'business-demo-activity-rideshare',
            currentLegalEntity: {
              id: 'demo-entity-taxi-limited',
              legalName: 'Taxi Limited',
            },
          },
        ],
      },
      '/api/businesses',
    );
    expect(directory.businesses[0].currentLegalEntity).toMatchObject({
      id: 'demo-entity-taxi-limited',
      legalName: 'Taxi Limited',
    });

    await resetDemoData();
    const restored = await demoBusinessEntityPeriods(
      'business-demo-activity-delivery',
    );
    expect(restored).toHaveLength(1);
    expect(restored[0]).toMatchObject({
      legalEntityId: 'business-entity-primary',
      effectiveTo: null,
    });
  });
});
