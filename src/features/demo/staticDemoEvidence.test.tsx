import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, it } from 'vitest';
import { EvidencePreview } from '../attachments/EvidencePreview';
import { recordDemoMutation, resetDemoData } from './demoStore';
import {
  readStaticDemoAttachments,
  readStaticDemoDocuments,
  staticDemoEvidenceCounts,
} from './staticDemoEvidence';
import { readStaticDemoBusinesses } from './staticDemoClient';
import manifest from './staticDemoEvidenceManifest.json';

const businessId = 'business-demo-activity-delivery';
const recordId = 'demo-fuel-1';
beforeEach(() => resetDemoData());

async function upload(body: Record<string, unknown>) {
  return recordDemoMutation('/api/attachments', {
    method: 'POST',
    body: JSON.stringify({
      businessId,
      recordType: 'EXPENSE',
      recordId,
      file: 'browser-only.pdf',
      ...body,
    }),
  }) as Promise<{ attachment: { id: string } }>;
}

it.each(manifest.documents)(
  'provides scoped static evidence for $recordId',
  async (seed) => {
    const { documents } = await readStaticDemoDocuments(seed.businessId);
    expect(documents).toHaveLength(1);
    expect(documents[0]).toMatchObject({
      id: seed.id,
      recordId: seed.recordId,
      previewUrl: seed.assetPath,
      downloadUrl: null,
      mimeType: 'application/pdf',
      sha256: seed.sha256,
      fileSize: seed.fileSize,
    });
    expect(documents[0].recordLabel).not.toBe('Demo record');
    await expect(
      readStaticDemoAttachments(
        'business-demo-activity-unknown',
        'EXPENSE',
        seed.recordId,
      ),
    ).rejects.toThrow();
  },
);

it('rejects unknown records, invalid types and records from another business', async () => {
  await expect(
    readStaticDemoAttachments(
      'business-demo-activity-rideshare',
      'EXPENSE',
      recordId,
    ),
  ).rejects.toThrow();
  await expect(
    readStaticDemoAttachments(businessId, 'EXPENSE', 'missing'),
  ).rejects.toThrow();
  await expect(
    // @ts-expect-error exercise untrusted runtime input
    readStaticDemoAttachments(businessId, '__proto__', recordId),
  ).rejects.toThrow('Invalid record type');
});

it('keeps browser uploads metadata-only and ignores supplied private URLs', async () => {
  await upload({
    previewUrl: '/api/attachments/preview?id=private',
    downloadUrl: 'https://private.invalid/file',
    mimeType: 'application/pdf',
    fileSize: 900,
    sha256: 'fake',
  });
  const { documents } = await readStaticDemoDocuments(businessId);
  const local = documents.find((row) => row.id !== 'static-evidence-fuel')!;
  expect(local).toMatchObject({
    originalFilename: 'browser-only.pdf',
    previewUrl: null,
    downloadUrl: null,
    fileSize: 0,
    mimeType: 'application/octet-stream',
    sha256: null,
  });
  expect(
    (await staticDemoEvidenceCounts(businessId)).get(`EXPENSE:${recordId}`),
  ).toBe(2);
  await resetDemoData();
  expect((await readStaticDemoDocuments(businessId)).documents).toHaveLength(1);
});

it('preserves historical versions while listing only the current replacement', async () => {
  const first = await upload({ replaceAttachmentId: 'static-evidence-fuel' });
  const second = await upload({ replaceAttachmentId: first.attachment.id });
  const { attachments } = await readStaticDemoAttachments(
    businessId,
    'EXPENSE',
    recordId,
  );
  expect(attachments).toHaveLength(3);
  expect(
    attachments.find((row) => row.id === second.attachment.id),
  ).toMatchObject({
    versionNumber: 3,
    isCurrent: true,
    versionGroupId: 'static-evidence-group-fuel',
    previewUrl: null,
  });
  expect(
    attachments.find((row) => row.id === 'static-evidence-fuel'),
  ).toMatchObject({
    versionNumber: 1,
    isCurrent: false,
    previewUrl: manifest.documents[0].assetPath,
  });
  expect((await readStaticDemoDocuments(businessId)).documents).toHaveLength(1);
  expect(
    (await staticDemoEvidenceCounts(businessId)).get(`EXPENSE:${recordId}`),
  ).toBe(1);
});

it.each(['static-evidence-uber', 'missing-attachment'])(
  'rejects an out-of-scope replacement %s',
  async (replaceAttachmentId) => {
    await upload({ replaceAttachmentId });
    await expect(readStaticDemoDocuments(businessId)).rejects.toThrow(
      'out-of-scope',
    );
  },
);

it('hides evidence when its parent is trashed and restores it with the parent', async () => {
  const body = JSON.stringify({ businessId, recordType: 'EXPENSE', recordId });
  await recordDemoMutation('/api/trash', { method: 'POST', body });
  expect((await readStaticDemoDocuments(businessId)).documents).toEqual([]);
  await expect(
    readStaticDemoAttachments(businessId, 'EXPENSE', recordId),
  ).rejects.toThrow();
  await recordDemoMutation('/api/trash/restore', { method: 'POST', body });
  expect((await readStaticDemoDocuments(businessId)).documents).toHaveLength(1);
});

it('keeps missing receipt counts aligned with current evidence and reset', async () => {
  const before = (await readStaticDemoBusinesses()).businesses.find(
    (row) => row.id === businessId,
  )!;
  await upload({ replaceAttachmentId: 'static-evidence-fuel' });
  const after = (await readStaticDemoBusinesses()).businesses.find(
    (row) => row.id === businessId,
  )!;
  expect(after.missingReceiptCount).toBe(before.missingReceiptCount);
  await resetDemoData();
  expect(
    (await readStaticDemoBusinesses()).businesses.find(
      (row) => row.id === businessId,
    )?.missingReceiptCount,
  ).toBe(before.missingReceiptCount);
});

it.each([true, false])(
  'opens and closes the bundled PDF preview (download permission: %s)',
  async (canDownload) => {
    const { documents } = await readStaticDemoDocuments(businessId);
    render(<EvidencePreview file={documents[0]} canDownload={canDownload} />);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'Preview fuel-fictional-demo.pdf' }),
    );
    expect(
      screen.getByTitle('Preview of fuel-fictional-demo.pdf'),
    ).toHaveAttribute('src', manifest.documents[0].assetPath);
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Close preview fuel-fictional-demo.pdf',
      }),
    );
    expect(
      screen.queryByTitle('Preview of fuel-fictional-demo.pdf'),
    ).not.toBeInTheDocument();
  },
);
