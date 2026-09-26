import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { apiRequest, useAuth } from '../features/auth/AuthContext';
import { useBusinessDirectory } from '../features/business/BusinessDirectoryContext';
import {
  type BusinessExpense,
  type ExpenseType,
  expenseTypeLabels,
  formatExpenseDate,
  formatMoney,
  plainLabel,
} from '../features/expenses/businessExpense';

const expenseTypes = Object.keys(expenseTypeLabels) as ExpenseType[];

export function ExpensesPage() {
  const { businessId = '' } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const { businesses } = useBusinessDirectory();
  const { user } = useAuth();
  const business = businesses.find((candidate) => candidate.id === businessId);
  const [expenses, setExpenses] = useState<BusinessExpense[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState('');
  const selectedType = searchParams.get('type') as ExpenseType | null;
  const type =
    selectedType && expenseTypes.includes(selectedType) ? selectedType : '';

  const load = useCallback(async () => {
    setError('');
    try {
      const result = await apiRequest<{ expenses: BusinessExpense[] }>(
        `/api/businesses/${businessId}/expenses`,
      );
      setExpenses(result.expenses);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Unable to load expenses.',
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

  const categories = useMemo(
    () =>
      [...new Set(expenses.map((expense) => expense.categoryName))].sort(
        (left, right) => left.localeCompare(right),
      ),
    [expenses],
  );
  const filtered = expenses.filter((expense) => {
    const text =
      `${expense.merchantName} ${expense.categoryName} ${expense.description ?? ''}`.toLowerCase();
    return (
      (!query || text.includes(query.toLowerCase())) &&
      (!type || expense.expenseType === type) &&
      (!dateFrom || expense.purchaseDatetime.slice(0, 10) >= dateFrom) &&
      (!category || expense.categoryName === category) &&
      (!status || expense.status === status)
    );
  });

  function changeType(next: string) {
    const parameters = new URLSearchParams(searchParams);
    if (next) parameters.set('type', next);
    else parameters.delete('type');
    setSearchParams(parameters, { replace: true });
  }

  return (
    <section aria-labelledby="expenses-heading">
      <div className="page-heading">
        <div>
          <span className="eyebrow">Business expenses</span>
          <h1 id="expenses-heading">Expenses</h1>
          <p>All expenses for {business?.name ?? 'this business'}.</p>
        </div>
        {user?.role === 'OWNER' ? (
          <Link
            className="button-link"
            to={`/app/businesses/${businessId}/expenses/new`}
          >
            Add expense
          </Link>
        ) : null}
      </div>

      <div className="expense-filter-bar" aria-label="Expense filters">
        <label className="filter-search">
          <span className="sr-only">Search expenses</span>
          <input
            type="search"
            placeholder="Search expenses…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <label>
          <span className="sr-only">Expense type</span>
          <select
            aria-label="Expense type"
            value={type}
            onChange={(event) => changeType(event.target.value)}
          >
            <option value="">All types</option>
            {expenseTypes.map((expenseType) => (
              <option key={expenseType} value={expenseType}>
                {expenseTypeLabels[expenseType]}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="sr-only">From date</span>
          <input
            aria-label="From date"
            type="date"
            value={dateFrom}
            onChange={(event) => setDateFrom(event.target.value)}
          />
        </label>
        <label>
          <span className="sr-only">Category</span>
          <select
            aria-label="Category"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
          >
            <option value="">All categories</option>
            {categories.map((name) => (
              <option key={name}>{name}</option>
            ))}
          </select>
        </label>
        <label>
          <span className="sr-only">Status</span>
          <select
            aria-label="Status"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value="">All statuses</option>
            <option value="NEW">New</option>
            <option value="MISSING_INFORMATION">Missing information</option>
            <option value="READY_FOR_REVIEW">Ready for review</option>
            <option value="REVIEWED">Reviewed</option>
            <option value="PROCESSED">Processed</option>
          </select>
        </label>
      </div>

      {error ? (
        <div className="notice error" role="alert">
          <p>{error}</p>
          <button type="button" onClick={() => void load()}>
            Try again
          </button>
        </div>
      ) : null}
      {loading ? <p role="status">Loading expenses…</p> : null}
      {!loading && !error && !filtered.length ? (
        <div className="empty-state">
          <div>
            <h2>No matching expenses</h2>
            <p>
              Adjust the filters or add the first expense for this business.
            </p>
          </div>
        </div>
      ) : null}
      {!loading && !error && filtered.length ? (
        <div className="responsive-table-wrap">
          <table className="responsive-record-table">
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Merchant / description</th>
                <th scope="col">Type</th>
                <th scope="col">Category</th>
                <th scope="col">Amount</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((expense) => (
                <tr key={expense.id}>
                  <td data-label="Date">
                    {formatExpenseDate(expense.purchaseDatetime)}
                  </td>
                  <td data-label="Merchant / description">
                    <Link
                      to={`/app/businesses/${businessId}/expenses/${expense.id}`}
                    >
                      <strong>{expense.merchantName}</strong>
                    </Link>
                    {expense.description ? (
                      <small>{expense.description}</small>
                    ) : null}
                  </td>
                  <td data-label="Type">
                    {expenseTypeLabels[expense.expenseType]}
                  </td>
                  <td data-label="Category">{expense.categoryName}</td>
                  <td data-label="Amount">
                    {formatMoney(expense.totalAmountMinor, expense.currency)}
                  </td>
                  <td data-label="Status">
                    <span
                      className={`status-badge ${expense.status.toLowerCase()}`}
                    >
                      {plainLabel(expense.status)}
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
