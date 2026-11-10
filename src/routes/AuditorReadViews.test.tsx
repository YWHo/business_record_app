import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ExportsPage } from './ExportsPage';
import { AuditTrailPage } from './AuditTrailPage';
import { apiRequest, useAuth } from '../features/auth/AuthContext';
vi.mock('../features/auth/AuthContext', () => ({
  apiRequest: vi.fn(),
  useAuth: vi.fn(),
}));
function open(element: React.ReactElement, path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/businesses/:businessId/*" element={element} />
      </Routes>
    </MemoryRouter>,
  );
}
describe('auditor read views', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuth).mockReturnValue({
      user: { role: 'AUDITOR' },
      configuration: { environment: 'local' },
    } as ReturnType<typeof useAuth>);
  });
  it('views source totals and period filters without requesting archive or export history', async () => {
    vi.mocked(apiRequest).mockResolvedValue({
      note: 'Source totals, not profit.',
      rows: [
        {
          family: 'EXPENSE',
          subtype: 'GENERAL',
          currency: 'NZD',
          record_count: 2,
          recorded_total_minor: 12345,
        },
      ],
    });
    open(<ExportsPage />, '/businesses/one/reports');
    expect(await screen.findByText('$123.45')).toBeVisible();
    expect(apiRequest).toHaveBeenCalledWith(
      '/api/reports/summary?scope=FULL&businessId=one',
    );
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.queryByText('Successful exports')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Report period'), {
      target: { value: 'MONTH' },
    });
    fireEvent.change(screen.getByLabelText('Month'), {
      target: { value: '2026-09' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'View report' }));
    await waitFor(() =>
      expect(apiRequest).toHaveBeenLastCalledWith(
        '/api/reports/summary?scope=MONTH&month=2026-09&businessId=one',
      ),
    );
  });
  it('explains a report with no visible records', async () => {
    vi.mocked(apiRequest).mockResolvedValue({
      rows: [],
      note: 'Source totals.',
    });
    open(<ExportsPage />, '/businesses/one/reports');
    expect(await screen.findByText(/No records match/)).toBeVisible();
  });
  it('shows a report failure without retaining a previous total', async () => {
    vi.mocked(apiRequest).mockRejectedValue(new Error('Report unavailable.'));
    open(<ExportsPage />, '/businesses/one/reports');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Report unavailable.',
    );
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
  it('filters and paginates financial audit events without loading administration', async () => {
    vi.mocked(apiRequest).mockResolvedValue({
      auditEvents: [
        {
          id: 'event',
          action: 'EXPENSE_CREATED',
          summary: 'Permitted receipt created.',
          userEmail: 'owner@example.invalid',
          createdAt: '2026-09-01T00:00:00.000Z',
          changedFields: { amountMinor: 12345 },
        },
      ],
      page: { number: 1, hasNext: true },
    });
    open(<AuditTrailPage />, '/businesses/one/audit-trail');
    expect(await screen.findByText('Permitted receipt created.')).toBeVisible();
    expect(screen.queryByText('Retention settings')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Action'), {
      target: { value: 'EXPENSE_CREATED' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Filter history' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Next events' })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Next events' }));
    await waitFor(() =>
      expect(apiRequest).toHaveBeenLastCalledWith(
        '/api/audit-log?page=2&action=EXPENSE_CREATED&businessId=one',
      ),
    );
    expect(
      vi
        .mocked(apiRequest)
        .mock.calls.every(([path]) => path.startsWith('/api/audit-log?')),
    ).toBe(true);
  });
});
