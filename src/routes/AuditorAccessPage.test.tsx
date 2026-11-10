import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuditorAccessPage } from './AuditorAccessPage';
import { apiRequest, useAuth } from '../features/auth/AuthContext';
vi.mock('../features/auth/AuthContext', () => ({
  useAuth: vi.fn(),
  apiRequest: vi.fn(),
}));
function open() {
  return render(
    <RouterProvider
      router={createMemoryRouter(
        [
          { path: '/access', element: <AuditorAccessPage /> },
          { path: '/app/businesses', element: <h1>Business directory</h1> },
        ],
        { initialEntries: ['/access'] },
      )}
    />,
  );
}
describe('owner auditor access route', () => {
  beforeEach(() => vi.clearAllMocks());
  it.each(['ACCOUNTANT', 'AUDITOR'])(
    'redirects %s before loading any administrative data',
    async (role) => {
      vi.mocked(useAuth).mockReturnValue({
        user: { role },
        configuration: { demoHelper: false },
      } as ReturnType<typeof useAuth>);
      open();
      expect(
        await screen.findByRole('heading', { name: 'Business directory' }),
      ).toBeVisible();
      expect(apiRequest).not.toHaveBeenCalled();
    },
  );
  it('keeps the demo owner outside private member administration', async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { role: 'OWNER' },
      configuration: { demoHelper: true },
    } as ReturnType<typeof useAuth>);
    open();
    expect(
      await screen.findByRole('heading', { name: 'Business directory' }),
    ).toBeVisible();
    expect(apiRequest).not.toHaveBeenCalled();
  });
});
