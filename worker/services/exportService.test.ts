import { describe, expect, it } from 'vitest';
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
    expect(csvDocument([{ note: 'one,"two"' }], [{ key: 'note' }])).toContain(
      '"one,""two"""',
    );
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

  it('marks missing and stale backups due', () => {
    const now = new Date('2026-09-09T00:00:00.000Z');
    expect(backupDue(null, 30, now)).toBe(true);
    expect(backupDue('2026-08-01T00:00:00.000Z', 30, now)).toBe(true);
    expect(backupDue('2026-09-01T00:00:00.000Z', 30, now)).toBe(false);
  });
});
