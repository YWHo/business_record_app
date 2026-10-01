import { useCallback, useEffect, useState } from 'react';
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router-dom';
import { FormError } from '../components/FormError';
import { ApiError, apiRequest, useAuth } from '../features/auth/AuthContext';
import { useBusinessDirectory } from '../features/business/BusinessDirectoryContext';
import {
  type BusinessExpense,
  type ExpenseType,
  expenseTypeLabels,
} from '../features/expenses/businessExpense';
import {
  GeneralExpenseForm,
  ParkingForm,
} from '../features/expenses/ExpenseForms';
import {
  emptyExpenseDraft,
  emptyParkingDraft,
  expenseBody,
  localDateTime,
  type ExpenseDraft,
  type ParkingDraft,
  type ReferenceOption,
} from '../features/expenses/expenseModel';
import {
  FuelForm,
  emptyFuelDraft,
  fuelDraftFrom,
  fuelRequestBody,
  type FuelDraft,
  type FuelRecord,
} from './FuelPage';
import {
  InsuranceForm,
  emptyInsuranceDraft,
  insuranceDraftFrom,
  insuranceRequestBody,
  type InsuranceDraft,
  type InsuranceRecord,
} from './InsurancePage';

interface Warning {
  code: string;
  message: string;
}

const expenseTypes = Object.keys(expenseTypeLabels) as ExpenseType[];

function generalDraftFrom(expense: BusinessExpense): ExpenseDraft {
  return {
    businessActivityId: '',
    expenseCategoryId: expense.expenseCategoryId,
    merchantName: expense.merchantName,
    purchaseDatetime: localDateTime(expense.purchaseDatetime),
    totalAmount: (expense.totalAmountMinor / 100).toFixed(2),
    currency: expense.currency,
    gstAmount:
      expense.gstAmountMinor === null || expense.gstAmountMinor === undefined
        ? ''
        : (expense.gstAmountMinor / 100).toFixed(2),
    gstStatus: expense.gstStatus ?? 'UNKNOWN',
    description: expense.description ?? '',
    recurrenceType: expense.recurrenceType ?? 'ONE_OFF',
  };
}

function parkingDraftFrom(expense: BusinessExpense): ParkingDraft {
  return {
    ...generalDraftFrom(expense),
    vehicleId: expense.vehicleId ?? '',
    parkingProvider: expense.parkingProvider ?? '',
    parkingLocation: expense.parkingLocation ?? '',
    parkingStartDatetime: expense.parkingStartDatetime
      ? localDateTime(expense.parkingStartDatetime)
      : '',
    parkingEndDatetime: expense.parkingEndDatetime
      ? localDateTime(expense.parkingEndDatetime)
      : '',
    parkingReference: expense.parkingReference ?? '',
  };
}

export function ExpenseFormPage({ mode }: { mode: 'create' | 'edit' }) {
  const { businessId = '', expenseId = '' } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { businesses } = useBusinessDirectory();
  const { configuration, user } = useAuth();
  const business = businesses.find((candidate) => candidate.id === businessId);
  const requestedType = searchParams.get('type') as ExpenseType | null;
  const [expenseType, setExpenseType] = useState<ExpenseType>(
    requestedType && expenseTypes.includes(requestedType)
      ? requestedType
      : 'GENERAL',
  );
  const [expense, setExpense] = useState<BusinessExpense | null>(null);
  const [categories, setCategories] = useState<ReferenceOption[]>([]);
  const [vehicles, setVehicles] = useState<ReferenceOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pending, setPending] = useState<{
    submit: (confirmed: string[]) => Promise<void>;
    warnings: Warning[];
  } | null>(null);

  const load = useCallback(async () => {
    setError('');
    try {
      const requests: [
        Promise<{
          categories: Array<{
            id: string;
            name: string;
            active: boolean;
            systemKey: string | null;
          }>;
        }>,
        Promise<{
          vehicles: Array<{
            id: string;
            registration: string;
            active: boolean;
          }>;
        }>,
        Promise<{ expense: BusinessExpense }> | null,
      ] = [
        apiRequest('/api/expense-categories'),
        apiRequest('/api/vehicles'),
        mode === 'edit'
          ? apiRequest(`/api/businesses/${businessId}/expenses/${expenseId}`)
          : null,
      ];
      const [categoryResult, vehicleResult, expenseResult] = await Promise.all([
        requests[0],
        requests[1],
        requests[2] ?? Promise.resolve(null),
      ]);
      setCategories(
        categoryResult.categories
          .filter(
            (item) =>
              !['FUEL', 'PARKING', 'VEHICLE_INSURANCE'].includes(
                item.systemKey ?? '',
              ),
          )
          .map((item) => ({
            id: item.id,
            label: item.name,
            active: item.active,
          })),
      );
      setVehicles(
        vehicleResult.vehicles.map((item) => ({
          id: item.id,
          label: item.registration,
          active: item.active,
        })),
      );
      if (expenseResult) {
        setExpense(expenseResult.expense);
        setExpenseType(expenseResult.expense.expenseType);
      }
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Unable to load expense.',
      );
    } finally {
      setLoading(false);
    }
  }, [businessId, expenseId, mode]);

  useEffect(() => {
    // Loading remote state is the synchronization performed by this effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function submit(body: object, confirmedWarnings: string[] = []) {
    setError('');
    const path =
      mode === 'edit'
        ? `/api/businesses/${businessId}/expenses/${expenseId}`
        : `/api/businesses/${businessId}/expenses`;
    try {
      const result = await apiRequest<Record<string, unknown>>(path, {
        method: mode === 'edit' ? 'PATCH' : 'POST',
        body: JSON.stringify({
          ...body,
          expenseType,
          confirmedWarnings,
        }),
      });
      setPending(null);
      const created = Object.values(result).find(
        (value) => value && typeof value === 'object' && 'id' in value,
      ) as { id?: string } | undefined;
      if (
        mode === 'edit' ||
        configuration?.environment === 'demo' ||
        !created?.id
      ) {
        void navigate(`/app/businesses/${businessId}/expenses`);
      } else {
        void navigate(`/app/businesses/${businessId}/expenses/${created.id}`);
      }
    } catch (caught) {
      const warnings =
        caught instanceof ApiError &&
        caught.status === 409 &&
        Array.isArray(caught.body?.warnings)
          ? (caught.body.warnings as Warning[])
          : null;
      if (warnings?.length) {
        setPending({
          warnings,
          submit: (confirmed) => submit(body, confirmed),
        });
        return;
      }
      const failure =
        caught instanceof Error ? caught : new Error('Unable to save expense.');
      setError(failure.message);
      throw failure;
    }
  }

  const entity = business?.currentLegalEntity;
  const context = entity?.legalName || entity?.tradingName;
  const cancelPath =
    mode === 'edit'
      ? `/app/businesses/${businessId}/expenses/${expenseId}`
      : `/app/businesses/${businessId}/expenses`;

  if (user?.role !== 'OWNER')
    return (
      <section className="empty-state" role="alert">
        <div>
          <h1>Expense changes are owner-only</h1>
          <p>Accountants can review expenses but cannot create or edit them.</p>
          <Link to={`/app/businesses/${businessId}/expenses`}>
            Back to expenses
          </Link>
        </div>
      </section>
    );

  return (
    <section aria-labelledby="expense-form-heading">
      <div className="page-heading">
        <div>
          <span className="eyebrow">Expenses</span>
          <h1 id="expense-form-heading">
            {mode === 'edit' ? 'Edit expense' : 'Add expense'}
          </h1>
          <p>
            {mode === 'edit' ? 'Update' : 'Record'} a business expense for{' '}
            {business?.name}. {context ? `${context} is derived by date.` : ''}
          </p>
        </div>
        <Link className="secondary-button button-link" to={cancelPath}>
          Cancel
        </Link>
      </div>

      <FormError message={error} />
      {loading ? <p role="status">Loading expense form…</p> : null}
      {pending ? (
        <section
          className="panel warning-panel"
          aria-labelledby="expense-warning-heading"
        >
          <h2 id="expense-warning-heading">Check before saving</h2>
          <ul>
            {pending.warnings.map((warning) => (
              <li key={warning.code}>{warning.message}</li>
            ))}
          </ul>
          <div className="button-row">
            <button
              type="button"
              className="secondary-button"
              onClick={() => setPending(null)}
            >
              Go back
            </button>
            <button
              type="button"
              onClick={() =>
                void pending.submit(pending.warnings.map(({ code }) => code))
              }
            >
              Save anyway
            </button>
          </div>
        </section>
      ) : null}

      {!loading && !error ? (
        <section className="panel focused-form-panel">
          {mode === 'create' ? (
            <label className="expense-type-selector">
              Expense type
              <select
                value={expenseType}
                onChange={(event) =>
                  setExpenseType(event.target.value as ExpenseType)
                }
              >
                {expenseTypes.map((type) => (
                  <option key={type} value={type}>
                    {expenseTypeLabels[type]}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <p className="context-chip">
              {expenseTypeLabels[expenseType]} expense
            </p>
          )}

          {expenseType === 'GENERAL' ? (
            <GeneralExpenseForm
              key={`general-${mode}-${expense?.id ?? 'new'}`}
              initial={
                expense ? generalDraftFrom(expense) : emptyExpenseDraft()
              }
              activities={[]}
              categories={categories}
              showActivity={false}
              submitLabel={mode === 'edit' ? 'Save changes' : 'Save expense'}
              onSubmit={(draft) => submit(expenseBody(draft))}
            />
          ) : null}
          {expenseType === 'PARKING' ? (
            <ParkingForm
              key={`parking-${mode}-${expense?.id ?? 'new'}`}
              initial={
                expense ? parkingDraftFrom(expense) : emptyParkingDraft()
              }
              activities={[]}
              vehicles={vehicles}
              showActivity={false}
              submitLabel={mode === 'edit' ? 'Save changes' : 'Save expense'}
              onSubmit={(draft) => submit(expenseBody(draft))}
            />
          ) : null}
          {expenseType === 'FUEL' ? (
            <FuelForm
              key={`fuel-${mode}-${expense?.id ?? 'new'}`}
              initial={
                expense
                  ? fuelDraftFrom(expense as unknown as FuelRecord)
                  : emptyFuelDraft()
              }
              activities={[]}
              vehicles={vehicles}
              showActivity={false}
              submitLabel={mode === 'edit' ? 'Save changes' : 'Save expense'}
              onSubmit={(draft: FuelDraft) => submit(fuelRequestBody(draft))}
            />
          ) : null}
          {expenseType === 'INSURANCE' ? (
            <InsuranceForm
              key={`insurance-${mode}-${expense?.id ?? 'new'}`}
              initial={
                expense
                  ? insuranceDraftFrom(expense as unknown as InsuranceRecord)
                  : emptyInsuranceDraft()
              }
              activities={[]}
              vehicles={vehicles}
              showActivity={false}
              submitLabel={mode === 'edit' ? 'Save changes' : 'Save expense'}
              onSubmit={(draft: InsuranceDraft) =>
                submit(insuranceRequestBody(draft))
              }
            />
          ) : null}
        </section>
      ) : null}
    </section>
  );
}
