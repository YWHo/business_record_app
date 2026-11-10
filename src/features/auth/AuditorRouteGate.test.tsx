import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { AuditorRouteGate } from './AuditorRouteGate';
import { useAuth } from './AuthContext';
vi.mock('./AuthContext', () => ({ useAuth: vi.fn() }));
describe('AuditorRouteGate', () => {
  it.each([
    ['/app/accountant/', '/app/transactions'],
    ['/app/settings/account/auditors/new', '/app/businesses'],
    [
      '/app/businesses/one/settings/legal-entity/change',
      '/app/businesses/one/audit-trail',
    ],
    ['/app/businesses/one/governance', '/app/businesses/one/audit-trail'],
    ['/app/businesses/one/expenses/new', '/app/businesses/one/expenses'],
    ['/app/businesses/one/income/id/edit', '/app/businesses/one/income'],
    ['/app/businesses/one/mileage/new', '/app/businesses/one/mileage'],
    ['/app/businesses/one/SETTINGS', '/app/businesses/one/audit-trail'],
    ['/app/businesses/one/%73ettings', '/app/businesses/one/audit-trail'],
  ])(
    'redirects auditor %s before mounting the unavailable workflow',
    async (path, destination) => {
      vi.mocked(useAuth).mockReturnValue({
        user: { role: 'AUDITOR' },
      } as ReturnType<typeof useAuth>);
      const mount = vi.fn(() => <h1>Unavailable form</h1>);
      const router = createMemoryRouter(
        [
          {
            element: <AuditorRouteGate />,
            children: [{ path: '*', Component: mount }],
          },
          { path: destination, element: <h1>Read-only destination</h1> },
        ],
        { initialEntries: [path] },
      );
      render(<RouterProvider router={router} />);
      expect(
        await screen.findByRole('heading', { name: 'Read-only destination' }),
      ).toBeVisible();
      expect(mount).not.toHaveBeenCalled();
    },
  );
  it.each(['OWNER', 'ACCOUNTANT'])(
    'preserves %s routes for their existing permission checks',
    (role) => {
      vi.mocked(useAuth).mockReturnValue({ user: { role } } as ReturnType<
        typeof useAuth
      >);
      render(
        <RouterProvider
          router={createMemoryRouter(
            [
              {
                element: <AuditorRouteGate />,
                children: [{ path: '*', element: <h1>Existing workflow</h1> }],
              },
            ],
            { initialEntries: ['/app/businesses/one/settings'] },
          )}
        />,
      );
      expect(
        screen.getByRole('heading', { name: 'Existing workflow' }),
      ).toBeVisible();
    },
  );
});
