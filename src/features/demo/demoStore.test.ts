import { beforeEach, describe, expect, it } from 'vitest';
import {
  applyDemoOverlay,
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
    const seed = { records: [{ id: 'income-1', status: 'NEW' }] };
    await recordDemoMutation('/api/record-status', {
      method: 'PATCH',
      body: JSON.stringify({
        recordId: 'income-1',
        status: 'READY_FOR_REVIEW',
      }),
    });
    const changed = await applyDemoOverlay(seed, '/api/transactions');
    expect(changed.records[0].status).toBe('READY_FOR_REVIEW');
    expect(seed.records[0].status).toBe('NEW');
  });

  it('uses tombstones without deleting seed records and can restore them', async () => {
    const seed = { records: [{ id: 'expense-1', status: 'REVIEWED' }] };
    await recordDemoMutation('/api/trash', {
      method: 'POST',
      body: JSON.stringify({ recordId: 'expense-1', recordType: 'EXPENSE' }),
    });
    await expect(applyDemoOverlay(seed, '/api/transactions')).resolves.toEqual({
      records: [],
    });
    expect(seed.records).toHaveLength(1);

    await recordDemoMutation('/api/trash/restore', {
      method: 'POST',
      body: JSON.stringify({ recordId: 'expense-1', recordType: 'EXPENSE' }),
    });
    await expect(applyDemoOverlay(seed, '/api/transactions')).resolves.toEqual(
      seed,
    );
  });
});
