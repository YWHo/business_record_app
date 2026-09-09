import { HttpError } from '../lib/http';

export type ExportScope = 'MONTH' | 'TAX_YEAR' | 'FULL';

export interface ExportPeriod {
  scope: ExportScope;
  periodKey: string | null;
  from: string | null;
  to: string | null;
}

export interface ZipEntry {
  path: string;
  size: number;
  load: () => Promise<Uint8Array>;
}

export function exportPeriod(
  scopeValue: string | null,
  month: string | null,
  taxYear: string | null,
  taxYearEndMonth: number,
  taxYearEndDay: number,
): ExportPeriod {
  const scope = (scopeValue ?? '').toUpperCase();
  if (!['MONTH', 'TAX_YEAR', 'FULL'].includes(scope))
    throw new HttpError(400, 'Export scope is invalid.');
  if (scope === 'FULL')
    return { scope: 'FULL', periodKey: null, from: null, to: null };
  if (scope === 'MONTH') {
    if (!month || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month))
      throw new HttpError(400, 'Month must use YYYY-MM.');
    const [year, monthNumber] = month.split('-').map(Number);
    const end = new Date(Date.UTC(year, monthNumber, 0))
      .toISOString()
      .slice(0, 10);
    return {
      scope: 'MONTH',
      periodKey: month,
      from: `${month}-01`,
      to: end,
    };
  }
  if (!taxYear || !/^\d{4}$/.test(taxYear) || Number(taxYear) < 1901)
    throw new HttpError(400, 'Tax year must be a four-digit ending year.');
  const endYear = Number(taxYear);
  const end = `${taxYear}-${String(taxYearEndMonth).padStart(2, '0')}-${String(taxYearEndDay).padStart(2, '0')}`;
  const priorEnd = new Date(
    Date.UTC(endYear - 1, taxYearEndMonth - 1, taxYearEndDay),
  );
  priorEnd.setUTCDate(priorEnd.getUTCDate() + 1);
  return {
    scope: 'TAX_YEAR',
    periodKey: taxYear,
    from: priorEnd.toISOString().slice(0, 10),
    to: end,
  };
}

export function csvValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  let text: string;
  if (typeof value === 'string') text = value;
  else if (typeof value === 'boolean') text = value ? 'true' : 'false';
  else if (typeof value === 'number' || typeof value === 'bigint')
    text = String(value);
  else text = JSON.stringify(value) ?? '';
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function csvDocument(
  rows: ReadonlyArray<Record<string, unknown>>,
  columns: ReadonlyArray<{ key: string; heading?: string }>,
): string {
  const line = (values: unknown[]) => values.map(csvValue).join(',');
  return `\uFEFF${line(columns.map(({ heading, key }) => heading ?? key))}\r\n${rows
    .map((row) => line(columns.map(({ key }) => row[key])))
    .join('\r\n')}${rows.length ? '\r\n' : ''}`;
}

export function safeArchiveName(value: string): string {
  const normalized = value.normalize('NFKC').replace(/[\\/:*?"<>|]/g, '_');
  const name = [...normalized]
    .map((character) => {
      const code = character.codePointAt(0) ?? 0;
      return code < 32 || code === 127 ? '_' : character;
    })
    .join('')
    .replace(/^\.+/, '')
    .trim();
  return (name || 'document').slice(0, 180);
}

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let value = n;
    for (let bit = 0; bit < 8; bit += 1)
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    table[n] = value >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function view(size: number) {
  const bytes = new Uint8Array(size);
  return { bytes, data: new DataView(bytes.buffer) };
}

function zipTime(date: Date) {
  const year = Math.max(1980, date.getUTCFullYear());
  return {
    time:
      (date.getUTCHours() << 11) |
      (date.getUTCMinutes() << 5) |
      Math.floor(date.getUTCSeconds() / 2),
    date:
      ((year - 1980) << 9) |
      ((date.getUTCMonth() + 1) << 5) |
      date.getUTCDate(),
  };
}

function localHeader(name: Uint8Array, size: number, crc: number, at: Date) {
  const { bytes, data } = view(30 + name.length);
  const stamp = zipTime(at);
  data.setUint32(0, 0x04034b50, true);
  data.setUint16(4, 20, true);
  data.setUint16(6, 0x0800, true);
  data.setUint16(8, 0, true);
  data.setUint16(10, stamp.time, true);
  data.setUint16(12, stamp.date, true);
  data.setUint32(14, crc, true);
  data.setUint32(18, size, true);
  data.setUint32(22, size, true);
  data.setUint16(26, name.length, true);
  bytes.set(name, 30);
  return bytes;
}

function centralHeader(
  name: Uint8Array,
  size: number,
  crc: number,
  offset: number,
  at: Date,
) {
  const { bytes, data } = view(46 + name.length);
  const stamp = zipTime(at);
  data.setUint32(0, 0x02014b50, true);
  data.setUint16(4, 20, true);
  data.setUint16(6, 20, true);
  data.setUint16(8, 0x0800, true);
  data.setUint16(10, 0, true);
  data.setUint16(12, stamp.time, true);
  data.setUint16(14, stamp.date, true);
  data.setUint32(16, crc, true);
  data.setUint32(20, size, true);
  data.setUint32(24, size, true);
  data.setUint16(28, name.length, true);
  data.setUint32(42, offset, true);
  bytes.set(name, 46);
  return bytes;
}

function endRecord(entries: number, directorySize: number, offset: number) {
  const { bytes, data } = view(22);
  data.setUint32(0, 0x06054b50, true);
  data.setUint16(8, entries, true);
  data.setUint16(10, entries, true);
  data.setUint32(12, directorySize, true);
  data.setUint32(16, offset, true);
  return bytes;
}

export function storedZip(
  entries: ZipEntry[],
  generatedAt: Date,
): ReadableStream<Uint8Array> {
  if (entries.length > 65_535)
    throw new HttpError(413, 'Export contains too many files.');
  const encoder = new TextEncoder();
  let archiveSize = 22;
  for (const entry of entries) {
    if (
      !Number.isSafeInteger(entry.size) ||
      entry.size < 0 ||
      entry.size > 0xffffffff
    )
      throw new HttpError(
        413,
        'An export file is too large for the portable ZIP format.',
      );
    const nameSize = encoder.encode(entry.path).byteLength;
    archiveSize += 30 + nameSize + entry.size + 46 + nameSize;
    if (archiveSize > 0xffffffff)
      throw new HttpError(
        413,
        'Export is too large for the portable ZIP format.',
      );
  }
  let index = 0,
    offset = 0,
    finished = false;
  const central: Uint8Array[] = [];
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (finished) return;
      if (index < entries.length) {
        const entry = entries[index++];
        const name = encoder.encode(entry.path);
        const contents = await entry.load();
        if (contents.byteLength !== entry.size)
          throw new HttpError(500, `Export file size changed: ${entry.path}`);
        const checksum = crc32(contents);
        const header = localHeader(name, entry.size, checksum, generatedAt);
        central.push(
          centralHeader(name, entry.size, checksum, offset, generatedAt),
        );
        offset += header.byteLength + contents.byteLength;
        controller.enqueue(header);
        controller.enqueue(contents);
        return;
      }
      const centralOffset = offset;
      for (const header of central) {
        controller.enqueue(header);
        offset += header.byteLength;
      }
      controller.enqueue(
        endRecord(entries.length, offset - centralOffset, centralOffset),
      );
      finished = true;
      controller.close();
    },
  });
}

export function backupDue(
  lastSuccessfulExportAt: string | null,
  reminderDays: number,
  now = new Date(),
) {
  if (!lastSuccessfulExportAt) return true;
  const last = Date.parse(lastSuccessfulExportAt);
  return (
    !Number.isFinite(last) || now.valueOf() - last >= reminderDays * 86_400_000
  );
}
