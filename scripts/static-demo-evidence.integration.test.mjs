// @vitest-environment node
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import {
  listAttachments,
  listBusinessDocuments,
} from '../worker/routes/attachments';
import {
  readStaticDemoAttachments,
  readStaticDemoDocuments,
} from '../src/features/demo/staticDemoEvidence';
import { resetDemoData } from '../src/features/demo/demoStore';
import { seedStaticDemoEvidence } from './static-demo-evidence-fixture.mjs';

function read(path) {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}
const manifest = JSON.parse(
  read('../src/features/demo/staticDemoEvidenceManifest.json'),
);
let db;
function statement(sql, values = []) {
  return {
    bind(...bindings) {
      return statement(sql, bindings);
    },
    async first() {
      return db.prepare(sql).get(...values) ?? null;
    },
    async all() {
      return { success: true, results: db.prepare(sql).all(...values) };
    },
  };
}
beforeAll(() => {
  db = new DatabaseSync(':memory:');
  for (const name of readdirSync(new URL('../migrations/', import.meta.url))
    .filter((name) => name.endsWith('.sql'))
    .sort()) {
    const sql = read(`../migrations/${name}`);
    db.exec(name.startsWith('0009_') ? `BEGIN;${sql}COMMIT;` : sql);
  }
  db.exec(read('./seed-demo.sql'));
  seedStaticDemoEvidence(db);
});
afterAll(() => db.close());
beforeEach(() => resetDemoData());

it.each(manifest.documents)(
  'matches Worker attachment and directory metadata for $recordId',
  async (seed) => {
    const env = { APP_ENV: 'demo', DB: { prepare: statement } };
    const response = await listAttachments(
      new Request(
        `https://demo.invalid/api/attachments?recordType=${seed.recordType}&recordId=${seed.recordId}`,
      ),
      env,
    );
    const nativeAttachments = (await response.json()).attachments;
    const staticAttachments = (
      await readStaticDemoAttachments(
        seed.businessId,
        seed.recordType,
        seed.recordId,
      )
    ).attachments;
    expect(staticAttachments).toHaveLength(nativeAttachments.length);
    expect(staticAttachments[0]).toMatchObject({
      ...nativeAttachments[0],
      previewUrl: seed.assetPath,
      downloadUrl: null,
    });
    const directory = await listBusinessDocuments(
      new Request(
        `https://demo.invalid/api/businesses/${seed.businessId}/documents`,
      ),
      env,
      { businessId: seed.businessId },
    );
    const nativeDocuments = (await directory.json()).documents;
    const staticDocuments = (await readStaticDemoDocuments(seed.businessId))
      .documents;
    expect(staticDocuments).toEqual(
      nativeDocuments.map((row) => ({
        ...row,
        previewUrl: seed.assetPath,
        downloadUrl: null,
      })),
    );
  },
);

it.each(manifest.documents)(
  'ships a passive fictional PDF with matching bytes and hash: $id',
  (seed) => {
    const bytes = readFileSync(
      new URL(`../public${seed.assetPath}`, import.meta.url),
    );
    expect(bytes.length).toBe(seed.fileSize);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(seed.sha256);
    const pdf = bytes.toString('ascii');
    expect(pdf.startsWith('%PDF-1.4')).toBe(true);
    expect(pdf.endsWith('%%EOF\n')).toBe(true);
    expect(pdf).toContain('FICTIONAL DEMO EVIDENCE');
    expect(pdf).toContain(
      'Not a real receipt, invoice, or platform statement.',
    );
    expect(pdf).not.toMatch(
      /\/JavaScript|\/OpenAction|\/URI|\/api\/|object_key/,
    );
    const table = seed.recordType === 'EXPENSE' ? 'expenses' : 'income_records';
    const parent = db
      .prepare(`SELECT currency,total_amount_minor FROM ${table} WHERE id=?`)
      .get(seed.recordId);
    expect(pdf).toContain(
      `Recorded amount: ${parent.currency} ${(parent.total_amount_minor / 100).toFixed(2)}`,
    );
    const xref = Number(pdf.match(/startxref\n(\d+)/)[1]);
    expect(pdf.slice(xref, xref + 4)).toBe('xref');
  },
);
