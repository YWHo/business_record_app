import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { apiRequest } from '../features/auth/AuthContext';

interface BusinessDocument {
  id: string;
  recordType: 'EXPENSE' | 'INCOME' | 'WORK_SESSION';
  recordId: string;
  originalFilename: string;
  mimeType: string;
  fileSize: number;
  createdAt: string;
  createdByEmail: string;
  recordLabel: string;
  recordDate: string;
  recordStatus: string;
  downloadUrl: string;
}

interface MissingDocumentRecord {
  id: string;
  recordType: 'EXPENSE' | 'INCOME';
  subtype: string;
  transactionDate: string;
  counterparty: string;
  totalAmountMinor: number;
  currency: string;
  status: string;
}

const money = (minor: number, currency: string) =>
  new Intl.NumberFormat('en-NZ', { style: 'currency', currency }).format(
    minor / 100,
  );

function recordPath(
  businessId: string,
  record: { recordType: string; recordId?: string; id?: string },
) {
  const id = record.recordId ?? record.id ?? '';
  const collection =
    record.recordType === 'EXPENSE'
      ? 'expenses'
      : record.recordType === 'INCOME'
        ? 'income'
        : 'mileage';
  return `/app/businesses/${businessId}/${collection}/${id}`;
}

export function DocumentsPage() {
  const { businessId = '' } = useParams();
  const [view, setView] = useState<'FILES' | 'MISSING'>('FILES');
  const [documents, setDocuments] = useState<BusinessDocument[]>([]);
  const [missing, setMissing] = useState<MissingDocumentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const [documentResult, missingResult] = await Promise.all([
        apiRequest<{ documents: BusinessDocument[] }>(
          `/api/businesses/${businessId}/documents`,
        ),
        apiRequest<{ transactions: MissingDocumentRecord[] }>(
          `/api/businesses/${businessId}/transactions?attachment=MISSING`,
        ),
      ]);
      setDocuments(documentResult.documents);
      setMissing(missingResult.transactions);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Unable to load documents.',
      );
    } finally {
      setLoading(false);
    }
  }, [businessId]);

  useEffect(() => {
    // Loading remote state is the synchronization performed by this effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  return (
    <section aria-labelledby="documents-heading">
      <div className="page-heading">
        <div>
          <span className="eyebrow">Evidence and files</span>
          <h1 id="documents-heading">Documents</h1>
          <p>Find supporting files and records that still need evidence.</p>
        </div>
      </div>
      <div className="button-row" role="group" aria-label="Document view">
        <button
          type="button"
          className={view === 'FILES' ? '' : 'secondary-button'}
          onClick={() => setView('FILES')}
        >
          Files ({documents.length})
        </button>
        <button
          type="button"
          className={view === 'MISSING' ? '' : 'secondary-button'}
          onClick={() => setView('MISSING')}
        >
          Missing attachments ({missing.length})
        </button>
      </div>
      {error ? (
        <p className="notice error" role="alert">
          {error}
        </p>
      ) : null}
      {loading ? <p role="status">Loading documents…</p> : null}
      {!loading && view === 'FILES' && documents.length === 0 ? (
        <section className="empty-state">
          <div>
            <h2>No documents yet</h2>
            <p>
              Files uploaded from an expense, income, or work session appear
              here.
            </p>
          </div>
        </section>
      ) : null}
      {!loading && view === 'MISSING' && missing.length === 0 ? (
        <section className="empty-state">
          <div>
            <h2>No missing attachments</h2>
            <p>
              Every current income and expense record has supporting evidence.
            </p>
          </div>
        </section>
      ) : null}
      {view === 'FILES' && documents.length ? (
        <div className="responsive-table-wrap">
          <table className="responsive-record-table">
            <thead>
              <tr>
                <th>File</th>
                <th>Record</th>
                <th>Date</th>
                <th>Size</th>
                <th>Added</th>
              </tr>
            </thead>
            <tbody>
              {documents.map((document) => (
                <tr key={document.id}>
                  <td data-label="File">
                    <a href={document.downloadUrl}>
                      {document.originalFilename}
                    </a>
                    <small>{document.mimeType}</small>
                  </td>
                  <td data-label="Record">
                    <Link to={recordPath(businessId, document)}>
                      {document.recordLabel}
                    </Link>
                    <small>
                      {document.recordType.replace('_', ' ').toLowerCase()}
                    </small>
                  </td>
                  <td data-label="Date">{document.recordDate}</td>
                  <td data-label="Size">
                    {(document.fileSize / 1024).toLocaleString('en-NZ', {
                      maximumFractionDigits: 1,
                    })}{' '}
                    KB
                  </td>
                  <td data-label="Added">
                    {new Date(document.createdAt).toLocaleDateString('en-NZ')}
                    <small>{document.createdByEmail}</small>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {view === 'MISSING' && missing.length ? (
        <div className="responsive-table-wrap">
          <table className="responsive-record-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Record</th>
                <th>Type</th>
                <th>Amount</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {missing.map((record) => (
                <tr key={`${record.recordType}-${record.id}`}>
                  <td data-label="Date">{record.transactionDate}</td>
                  <td data-label="Record">
                    <Link to={recordPath(businessId, record)}>
                      {record.counterparty}
                    </Link>
                  </td>
                  <td data-label="Type">{record.subtype.toLowerCase()}</td>
                  <td data-label="Amount">
                    {money(record.totalAmountMinor, record.currency)}
                  </td>
                  <td data-label="Status">
                    {record.status.replaceAll('_', ' ').toLowerCase()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
