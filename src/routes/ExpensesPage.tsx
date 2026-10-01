import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import {
  ExpenseFilterBar,
  ExpenseTable,
} from '../components/WorkspacePatterns';
import { apiRequest, useAuth } from '../features/auth/AuthContext';
import { useBusinessDirectory } from '../features/business/BusinessDirectoryContext';
import {
  type BusinessExpense,
  type ExpenseType,
  expenseTypeLabels,
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

      <ExpenseFilterBar
        categories={categories}
        category={category}
        dateFrom={dateFrom}
        query={query}
        status={status}
        type={type}
        onCategoryChange={setCategory}
        onDateFromChange={setDateFrom}
        onQueryChange={setQuery}
        onStatusChange={setStatus}
        onTypeChange={changeType}
      />

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
        <ExpenseTable businessId={businessId} expenses={filtered} />
      ) : null}
    </section>
  );
}
