import { apiRequest } from '../auth/AuthContext';
import type { ExpenseType } from './businessExpense';

export async function saveExpense({
  mode,
  businessId,
  expenseId,
  expenseType,
  body,
  confirmedWarnings,
}: {
  mode: 'create' | 'edit';
  businessId: string;
  expenseId: string;
  expenseType: ExpenseType;
  body: object;
  confirmedWarnings: string[];
}): Promise<{ id?: string } | undefined> {
  const collection = `/api/businesses/${businessId}/expenses`;
  const result = await apiRequest<Record<string, unknown>>(
    mode === 'edit' ? `${collection}/${expenseId}` : collection,
    {
      method: mode === 'edit' ? 'PATCH' : 'POST',
      body: JSON.stringify({ ...body, expenseType, confirmedWarnings }),
    },
  );
  return Object.values(result).find(
    (value) => value && typeof value === 'object' && 'id' in value,
  ) as { id?: string } | undefined;
}
