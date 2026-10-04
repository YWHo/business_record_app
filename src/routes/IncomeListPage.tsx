import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { apiRequest, useAuth } from '../features/auth/AuthContext';
import { useBusinessDirectory } from '../features/business/BusinessDirectoryContext';
import {
  incomeDate,
  incomeMoney,
  incomeTitle,
  incomeTypeLabels,
  plainIncomeValue,
} from '../features/income/businessIncome';
import type { IncomeRecord, IncomeType } from './IncomePage';

const types = Object.keys(incomeTypeLabels) as IncomeType[];

export function IncomeListPage() {
  const { businessId = '' } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const { businesses } = useBusinessDirectory();
  const { user } = useAuth();
  const [records, setRecords] = useState<IncomeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const business = businesses.find((item) => item.id === businessId);
  const search = searchParams.get('q') ?? '';
  const type = searchParams.get('type') ?? '';
  const from = searchParams.get('from') ?? '';
  const status = searchParams.get('status') ?? '';

  const load = useCallback(async () => {
    setError('');
    try {
      const result = await apiRequest<{ incomeRecords: IncomeRecord[] }>(
        `/api/businesses/${businessId}/income`,
      );
      setRecords(result.incomeRecords);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Unable to load income.',
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

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return records.filter((record) => {
      if (type && record.incomeType !== type) return false;
      if (from && record.transactionDate.slice(0, 10) < from) return false;
      if (status && record.status !== status) return false;
      if (!query) return true;
      return [
        incomeTitle(record),
        record.activityName,
        record.notes ?? '',
        incomeTypeLabels[record.incomeType],
      ].some((value) => value.toLowerCase().includes(query));
    });
  }, [from, records, search, status, type]);

  function filter(key: string, value: string) {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    setSearchParams(next, { replace: true });
  }

  return (
    <section aria-labelledby="income-heading">
      <div className="page-heading">
        <div>
          <span className="eyebrow">Business income</span>
          <h1 id="income-heading">Income</h1>
          <p>All income for {business?.name}.</p>
        </div>
        {user?.role === 'OWNER' ? (
          <Link className="primary-button button-link" to="new">
            Add income
          </Link>
        ) : null}
      </div>
      {error ? (
        <p className="notice error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="record-filter-bar" aria-label="Income filters">
        <label>
          <span className="record-filter-label">Search</span>
          <input
            type="search"
            placeholder="Source, invoice number or notes"
            value={search}
            onChange={(event) => filter('q', event.target.value)}
          />
        </label>
        <label>
          <span className="record-filter-label">Income type</span>
          <select
            value={type}
            onChange={(event) => filter('type', event.target.value)}
          >
            <option value="">All income types</option>
            {types.map((value) => (
              <option key={value} value={value}>
                {incomeTypeLabels[value]}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="record-filter-label">Received on or after</span>
          <input
            type="date"
            value={from}
            onChange={(event) => filter('from', event.target.value)}
          />
        </label>
        <label>
          <span className="record-filter-label">Record status</span>
          <select
            value={status}
            onChange={(event) => filter('status', event.target.value)}
          >
            <option value="">All statuses</option>
            {[
              'NEW',
              'MISSING_INFORMATION',
              'READY_FOR_REVIEW',
              'REVIEWED',
              'PROCESSED',
            ].map((value) => (
              <option key={value} value={value}>
                {plainIncomeValue(value)}
              </option>
            ))}
          </select>
        </label>
      </div>
      {loading ? <p role="status">Loading income…</p> : null}
      {!loading && filtered.length === 0 ? (
        <section className="empty-state">
          <div>
            <h2>No matching income</h2>
            <p>
              Adjust the filters or add the first income record for this
              business.
            </p>
          </div>
        </section>
      ) : null}
      {filtered.length ? (
        <div className="responsive-record-table">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Source</th>
                <th>Type</th>
                <th>Amount</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((record) => (
                <tr key={record.id}>
                  <td data-label="Date">
                    {incomeDate(record.transactionDate)}
                  </td>
                  <td data-label="Source">
                    <Link to={record.id}>{incomeTitle(record)}</Link>
                  </td>
                  <td data-label="Type">
                    {incomeTypeLabels[record.incomeType]}
                  </td>
                  <td data-label="Amount" className="numeric-cell">
                    {incomeMoney(record.totalAmountMinor, record.currency)}
                  </td>
                  <td data-label="Status">
                    <span className="context-chip">
                      {plainIncomeValue(record.status)}
                    </span>
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
