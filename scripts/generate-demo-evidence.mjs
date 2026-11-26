import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';

const root = new URL('../', import.meta.url);
const dataset = JSON.parse(
  readFileSync(
    new URL('src/features/demo/staticDemoDataset.json', root),
    'utf8',
  ),
);
if (!/^[a-z0-9-]+$/.test(dataset.version)) {
  throw new Error('Invalid static dataset version.');
}
const examples = [
  ['fuel', 'EXPENSE', 'demo-fuel-1', 'Fictional fuel receipt'],
  [
    'uber',
    'INCOME',
    'demo-platform-2',
    'Combined Uber rides and Uber Eats statement',
  ],
  ['contract', 'INCOME', 'demo-contract-paid', 'Fictional contract invoice'],
  [
    'subscription',
    'INCOME',
    'demo-subscription-1',
    'Fictional subscription summary',
  ],
];

function pdf(lines) {
  const escaped = lines.map((line) =>
    String(line)
      .replace(/[^\x20-\x7e]/g, '?')
      .replace(/[\\()]/g, '\\$&'),
  );
  const content = `BT /F1 13 Tf 48 740 Td 22 TL ${escaped.map((line, index) => `${index ? 'T* ' : ''}(${line}) Tj`).join('\n')} ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
  ];
  let output = '%PDF-1.4\n';
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(output));
    output += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xref = Buffer.byteLength(output);
  output += `xref\n0 ${offsets.length}\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)
    .join(
      '',
    )}trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(output);
}

const directory = new URL(`public/demo-evidence/${dataset.version}/`, root);
mkdirSync(directory, { recursive: true });
const documents = examples.map(([name, recordType, recordId, title]) => {
  const record = dataset.tables[
    recordType === 'EXPENSE' ? 'expenses' : 'income_records'
  ].find((row) => row.id === recordId);
  if (!record || !Number.isSafeInteger(record.total_amount_minor)) {
    throw new Error('Fictional evidence parent missing or invalid.');
  }
  const filename = `${name}-fictional-demo.pdf`;
  const label = record.merchant_name ?? record.received_from;
  const date = (record.purchase_datetime ?? record.transaction_date).slice(
    0,
    10,
  );
  const bytes = pdf([
    'FICTIONAL DEMO EVIDENCE',
    'Not a real receipt, invoice, or platform statement.',
    '',
    title,
    `Source: ${label}`,
    `Record date: ${date}`,
    `Recorded amount: ${record.currency} ${(record.total_amount_minor / 100).toFixed(2)}`,
    '',
    'All transactions and identities are synthetic.',
    'This is a layout example, not a tax document.',
    'No bank details, tax identifiers, or private files are included.',
  ]);
  writeFileSync(new URL(filename, directory), bytes);
  return {
    id: `static-evidence-${name}`,
    businessId: record.business_id,
    legalEntityId: record.legal_entity_id,
    recordType,
    recordId,
    versionGroupId: `static-evidence-group-${name}`,
    originalFilename: filename,
    mimeType: 'application/pdf',
    fileSize: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    createdAt: record.created_at,
    createdByEmail: 'demo-owner@example.invalid',
    versionNumber: 1,
    isCurrent: true,
    displayRotationDegrees: 0,
    assetPath: `/demo-evidence/${dataset.version}/${filename}`,
  };
});
writeFileSync(
  new URL('src/features/demo/staticDemoEvidenceManifest.json', root),
  JSON.stringify({ datasetVersion: dataset.version, documents }, null, 2) +
    '\n',
);
console.log(`Generated ${documents.length} fictional static evidence PDFs.`);
