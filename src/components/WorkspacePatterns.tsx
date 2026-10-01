import { Link } from 'react-router-dom';
import type { BusinessSummary } from '../features/business/BusinessDirectoryContext';
import {
  type BusinessExpense,
  type ExpenseType,
  expenseTypeLabels,
  formatExpenseDate,
  formatMoney,
  plainLabel,
} from '../features/expenses/businessExpense';

const expenseTypes = Object.keys(expenseTypeLabels) as ExpenseType[];

const entityTypeLabels = {
  SOLE_TRADER: 'Sole trader',
  LIMITED_COMPANY: 'Limited company',
  PARTNERSHIP: 'Partnership',
  TRUST: 'Trust',
  OTHER: 'Other entity',
} as const;

export function EntityBadge({
  entity,
}: {
  entity: BusinessSummary['currentLegalEntity'];
}) {
  const name =
    entity?.legalName || entity?.tradingName || 'Legal entity not configured';
  const needsAttention =
    !entity || entity.attributionReviewRequired || entity.status !== 'ACTIVE';

  return (
    <span className={`entity-badge${needsAttention ? ' needs-attention' : ''}`}>
      <strong>{name}</strong>
      <small>
        {entity ? entityTypeLabels[entity.entityType] : 'Needs attention'}
      </small>
    </span>
  );
}

export function BusinessContextBadge({
  businessName,
  entity,
}: {
  businessName: string;
  entity: BusinessSummary['currentLegalEntity'];
}) {
  return (
    <div className="business-context-badge">
      <span>Current business</span>
      <strong>{businessName}</strong>
      <EntityBadge entity={entity} />
    </div>
  );
}

export function ExpenseTable({
  businessId,
  expenses,
}: {
  businessId: string;
  expenses: BusinessExpense[];
}) {
  return (
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
          {expenses.map((expense) => (
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
  );
}

export function ExpenseFilterBar({
  categories,
  category,
  dateFrom,
  onCategoryChange,
  onDateFromChange,
  onQueryChange,
  onStatusChange,
  onTypeChange,
  query,
  status,
  type,
}: {
  categories: string[];
  category: string;
  dateFrom: string;
  onCategoryChange: (value: string) => void;
  onDateFromChange: (value: string) => void;
  onQueryChange: (value: string) => void;
  onStatusChange: (value: string) => void;
  onTypeChange: (value: string) => void;
  query: string;
  status: string;
  type: string;
}) {
  return (
    <div className="expense-filter-bar" aria-label="Expense filters">
      <label className="filter-search">
        <span className="sr-only">Search expenses</span>
        <input
          type="search"
          placeholder="Search expenses…"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
        />
      </label>
      <label>
        <span className="sr-only">Expense type</span>
        <select
          aria-label="Expense type"
          value={type}
          onChange={(event) => onTypeChange(event.target.value)}
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
          onChange={(event) => onDateFromChange(event.target.value)}
        />
      </label>
      <label>
        <span className="sr-only">Category</span>
        <select
          aria-label="Category"
          value={category}
          onChange={(event) => onCategoryChange(event.target.value)}
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
          onChange={(event) => onStatusChange(event.target.value)}
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
  );
}

export interface OperatingPeriodView {
  effectiveFrom: string;
  effectiveTo: string | null;
  entityName: string;
  entityType: string;
  id: string;
}

function formatPeriodDate(value: string) {
  return new Intl.DateTimeFormat('en-NZ', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00Z`));
}

export function OperatingPeriodsTable({
  periods,
}: {
  periods: OperatingPeriodView[];
}) {
  return (
    <div className="table-wrap">
      <table className="responsive-record-table">
        <caption>Operating periods</caption>
        <thead>
          <tr>
            <th scope="col">From</th>
            <th scope="col">To</th>
            <th scope="col">Legal entity</th>
            <th scope="col">Entity type</th>
          </tr>
        </thead>
        <tbody>
          {periods.map((period) => (
            <tr key={period.id}>
              <td data-label="From">
                {formatPeriodDate(period.effectiveFrom)}
              </td>
              <td data-label="To">
                {period.effectiveTo
                  ? formatPeriodDate(period.effectiveTo)
                  : 'Present'}
              </td>
              <td data-label="Legal entity">{period.entityName}</td>
              <td data-label="Entity type">{period.entityType}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!periods.length ? <p>No operating periods are available.</p> : null}
    </div>
  );
}

export function AccountantEntityCard({
  entity,
  businesses,
}: {
  entity: BusinessSummary['currentLegalEntity'];
  businesses: BusinessSummary[];
}) {
  const records = businesses.reduce(
    (total, business) => total + business.recordCount,
    0,
  );
  const awaiting = businesses.reduce(
    (total, business) => total + business.awaitingReviewCount,
    0,
  );
  const plural = (value: number, singular: string, multiple = `${singular}s`) =>
    `${value} ${value === 1 ? singular : multiple}`;

  return (
    <article className="panel accountant-group">
      <div className="section-heading">
        <div>
          <h2>
            {entity?.legalName ||
              entity?.tradingName ||
              'Legal entity not configured'}
          </h2>
          <p>
            {entity ? entityTypeLabels[entity.entityType] : 'Needs attention'}
          </p>
        </div>
        {entity ? (
          <Link
            className="secondary-button"
            to={`/app/transactions?legalEntityId=${encodeURIComponent(entity.id)}&review=UNREVIEWED`}
          >
            Review entity
          </Link>
        ) : null}
      </div>
      <p className="accountant-totals">
        <strong>{plural(businesses.length, 'business', 'businesses')}</strong>
        <span>{plural(records, 'record')}</span>
        <span>{plural(awaiting, 'item')} awaiting review</span>
      </p>
      <ul className="accountant-business-list">
        {businesses.map((business) => (
          <li key={business.id}>
            <Link to={`/app/businesses/${business.id}/transactions`}>
              <span>{business.name}</span>
              <span aria-hidden="true">→</span>
            </Link>
          </li>
        ))}
      </ul>
    </article>
  );
}
