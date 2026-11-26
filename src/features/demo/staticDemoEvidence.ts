import manifest from './staticDemoEvidenceManifest.json';
import { staticDemoDatasetVersion } from './demoDatasetVersion';
import { applyDemoOverlay, demoStorageSnapshot } from './demoStore';
import {
  readStaticDemoDetail,
  readStaticDemoDetailCollection,
} from './staticDemoDetails';
import { readStaticDemoTable } from './staticDemo';

type RecordType = 'EXPENSE' | 'INCOME' | 'WORK_SESSION';
type Row = Record<string, unknown>;
const collections = {
  EXPENSE: 'expenses',
  INCOME: 'income',
  WORK_SESSION: 'work-sessions',
} as const;
export interface StaticDemoDocument {
  id: string;
  businessId: string;
  legalEntityId: string;
  recordType: RecordType;
  recordId: string;
  versionGroupId: string;
  originalFilename: string;
  mimeType: string;
  fileSize: number;
  sha256: string | null;
  createdAt: string;
  createdByEmail: string;
  versionNumber: number;
  isCurrent: boolean;
  displayRotationDegrees: number;
  downloadUrl: null;
  previewUrl: string | null;
  recordLabel: string;
  recordDate: string;
  recordStatus: string;
}
function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

async function evidenceRows(businessId: string): Promise<StaticDemoDocument[]> {
  if (manifest.datasetVersion !== staticDemoDatasetVersion) {
    throw new Error('Demo evidence version mismatch.');
  }
  if (
    !readStaticDemoTable('businesses').some(
      (business) => business.id === businessId,
    )
  ) {
    throw new Error('Demo business not found.');
  }
  const parents = new Map<string, Row>();
  for (const [type, collection] of Object.entries(collections)) {
    for (const row of await readStaticDemoDetailCollection(
      businessId,
      collection,
    )) {
      parents.set(`${type}:${text(row.id)}`, row);
    }
  }
  const seeds: Row[] = manifest.documents
    .filter((row) => row.businessId === businessId)
    .map((row) => ({ ...row }));
  const payload = await applyDemoOverlay(
    { documents: seeds },
    `/api/businesses/${encodeURIComponent(businessId)}/documents`,
  );
  const seedById = new Map(manifest.documents.map((row) => [row.id, row]));
  const localOrder = new Map(
    (await demoStorageSnapshot()).operations.map((operation, index) => [
      operation.id,
      index,
    ]),
  );
  const pending = payload.documents
    .filter((row) =>
      parents.has(`${text(row.recordType)}:${text(row.recordId)}`),
    )
    .sort(
      (a, b) =>
        (localOrder.get(text(a.id)) ?? -1) - (localOrder.get(text(b.id)) ?? -1),
    );
  const resolved = new Map<string, StaticDemoDocument>();
  const groups = new Map<string, number>();
  while (pending.length) {
    let progressed = false;
    for (let index = 0; index < pending.length;) {
      const row = pending[index];
      const replaceId = text(row.replaceAttachmentId);
      const replaced = replaceId ? resolved.get(replaceId) : undefined;
      if (replaceId && !replaced) {
        index += 1;
        continue;
      }
      if (
        replaced &&
        (replaced.recordId !== row.recordId ||
          replaced.recordType !== row.recordType)
      ) {
        throw new Error('Invalid demo evidence replacement.');
      }
      const id = text(row.id);
      const seed = seedById.get(id);
      if (
        seed &&
        (seed.businessId !== businessId ||
          seed.recordId !== row.recordId ||
          seed.recordType !== row.recordType)
      ) {
        throw new Error('Demo evidence parent cannot be changed.');
      }
      const parent = parents.get(
        `${text(row.recordType)}:${text(row.recordId)}`,
      )!;
      const group = replaced?.versionGroupId ?? seed?.versionGroupId ?? id;
      const versionNumber = (groups.get(group) ?? 0) + 1;
      groups.set(group, versionNumber);
      const rotation = Number(row.displayRotationDegrees ?? 0);
      const previewUrl = seed?.assetPath ?? null;
      if (
        previewUrl &&
        !previewUrl.startsWith(`/demo-evidence/${staticDemoDatasetVersion}/`)
      ) {
        throw new Error('Invalid demo evidence asset.');
      }
      resolved.set(id, {
        id,
        businessId,
        legalEntityId: text(parent.legalEntityId),
        recordType: row.recordType as RecordType,
        recordId: text(row.recordId),
        versionGroupId: group,
        originalFilename:
          seed?.originalFilename ??
          (text(row.originalFilename) || 'Browser-local demo document'),
        mimeType: seed?.mimeType ?? 'application/octet-stream',
        fileSize: seed?.fileSize ?? 0,
        sha256: seed?.sha256 ?? null,
        createdAt: text(row.createdAt),
        createdByEmail: seed?.createdByEmail ?? 'browser-local-demo',
        versionNumber,
        isCurrent: true,
        displayRotationDegrees: [0, 90, 180, 270].includes(rotation)
          ? rotation
          : 0,
        downloadUrl: null,
        previewUrl,
        recordLabel:
          text(parent.merchantName) ||
          text((parent.details as Row | null)?.providerName) ||
          text((parent.details as Row | null)?.clientName) ||
          text(parent.receivedFrom) ||
          text(parent.vehicleRegistration) ||
          'Demo record',
        recordDate: text(
          parent.purchaseDatetime ?? parent.transactionDate ?? parent.startedAt,
        ).slice(0, 10),
        recordStatus: text(parent.status),
      });
      pending.splice(index, 1);
      progressed = true;
    }
    if (!progressed) {
      throw new Error('Invalid or out-of-scope demo evidence replacement.');
    }
  }
  return [...resolved.values()].map((row) => ({
    ...row,
    isCurrent: row.versionNumber === groups.get(row.versionGroupId),
  }));
}

export async function readStaticDemoAttachments(
  businessId: string,
  recordType: RecordType,
  recordId: string,
) {
  if (!Object.hasOwn(collections, recordType)) {
    throw new Error('Invalid record type.');
  }
  await readStaticDemoDetail(businessId, collections[recordType], recordId);
  return {
    attachments: (await evidenceRows(businessId))
      .filter(
        (row) => row.recordType === recordType && row.recordId === recordId,
      )
      .sort(
        (a, b) =>
          b.createdAt.localeCompare(a.createdAt) ||
          b.versionNumber - a.versionNumber,
      )
      .slice(0, 200),
  };
}
export async function readStaticDemoDocuments(businessId: string) {
  return {
    documents: (await evidenceRows(businessId))
      .filter((row) => row.isCurrent)
      .sort(
        (a, b) =>
          b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id),
      )
      .slice(0, 200),
  };
}
export async function staticDemoEvidenceCounts(businessId: string) {
  const counts = new Map<string, number>();
  for (const row of await evidenceRows(businessId)) {
    if (row.isCurrent) {
      const key = `${row.recordType}:${row.recordId}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return counts;
}
