import { readFileSync } from 'node:fs';

// Test-only D1 metadata for the bundled public PDFs. No R2 or disk database.
export function seedStaticDemoEvidence(db) {
  const manifest = JSON.parse(
    readFileSync(
      new URL(
        '../src/features/demo/staticDemoEvidenceManifest.json',
        import.meta.url,
      ),
      'utf8',
    ),
  );
  for (const document of manifest.documents) {
    const table = {
      EXPENSE: 'expenses',
      INCOME: 'income_records',
      WORK_SESSION: 'work_sessions',
    }[document.recordType];
    if (!table) {
      throw new Error('Invalid evidence fixture type.');
    }
    const parent = db
      .prepare(
        `SELECT retention_until,purge_eligible_at FROM ${table} WHERE id=?`,
      )
      .get(document.recordId);
    db.prepare(
      `INSERT INTO attachments (id,record_type,record_id,version_group_id,object_key,original_filename,mime_type,file_size,sha256,created_by,created_at,version_number,is_current,retention_until,purge_eligible_at,business_account_id,business_id,legal_entity_id,display_rotation_degrees)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).run(
      document.id,
      document.recordType,
      document.recordId,
      document.versionGroupId,
      `fictional-test-only/${document.id}`,
      document.originalFilename,
      document.mimeType,
      document.fileSize,
      document.sha256,
      'demo-owner',
      document.createdAt,
      document.versionNumber,
      1,
      parent.retention_until,
      parent.purge_eligible_at,
      'business-account-primary',
      document.businessId,
      document.legalEntityId,
      0,
    );
  }
}
