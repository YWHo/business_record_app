import { describe, expect, it, vi } from 'vitest';
import {
  backupDue,
  crc32,
  csvDocument,
  exportPeriod,
  safeArchiveName,
  storedZip,
} from './exportService';

describe('portable export service', () => {
  it('derives monthly and configurable tax-year ranges', () => {
    expect(exportPeriod('MONTH', '2026-02', null, 3, 31)).toMatchObject({
      from: '2026-02-01',
      to: '2026-02-28',
    });
    expect(exportPeriod('TAX_YEAR', null, '2027', 3, 31)).toMatchObject({
      from: '2026-04-01',
      to: '2027-03-31',
    });
  });

  it('escapes CSV and unsafe archive names', () => {
    const csv = csvDocument(
      [
        { note: 'one,"two"' },
        { note: '=HYPERLINK("https://example.invalid")' },
      ],
      [{ key: 'note' }],
    );
    expect(csv).toContain('"one,""two"""');
    expect(csv).toContain("'=HYPERLINK");
    expect(safeArchiveName('../../invoice:1.pdf')).toBe('_.._invoice_1.pdf');
  });

  it('creates a readable stored ZIP envelope with a valid CRC', async () => {
    const bytes = new TextEncoder().encode('portable');
    const stream = storedZip(
      [
        {
          path: 'data/test.txt',
          size: bytes.length,
          load: () => Promise.resolve(bytes),
        },
      ],
      new Date('2026-09-09T00:00:00.000Z'),
    );
    const archive = new Uint8Array(await new Response(stream).arrayBuffer());
    expect(new DataView(archive.buffer).getUint32(0, true)).toBe(0x04034b50);
    expect(
      new DataView(archive.buffer).getUint32(archive.length - 22, true),
    ).toBe(0x06054b50);
    expect(crc32(bytes)).toBe(0xc26da664);
  });

  it('records completion only after every entry has loaded successfully', async () => {
    const events: string[] = [];
    const bytes = new TextEncoder().encode('verified');
    const stream = storedZip(
      [
        {
          path: 'data/verified.txt',
          size: bytes.length,
          load: () => {
            events.push('loaded');
            return Promise.resolve(bytes);
          },
        },
      ],
      new Date('2026-09-14T00:00:00.000Z'),
      () => {
        events.push('completed');
        return Promise.resolve();
      },
    );

    await new Response(stream).arrayBuffer();
    expect(events).toEqual(['loaded', 'completed']);
  });

  it('does not record completion when an entry cannot be loaded', async () => {
    const onComplete = vi.fn(() => Promise.resolve());
    const stream = storedZip(
      [
        {
          path: 'documents/missing.pdf',
          size: 10,
          load: () => Promise.reject(new Error('R2 unavailable')),
        },
      ],
      new Date('2026-09-14T00:00:00.000Z'),
      onComplete,
    );

    await expect(new Response(stream).arrayBuffer()).rejects.toThrow(
      'R2 unavailable',
    );
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('marks missing and stale backups due', () => {
    const now = new Date('2026-09-09T00:00:00.000Z');
    expect(backupDue(null, 30, now)).toBe(true);
    expect(backupDue('2026-08-01T00:00:00.000Z', 30, now)).toBe(true);
    expect(backupDue('2026-09-01T00:00:00.000Z', 30, now)).toBe(false);
  });
});
