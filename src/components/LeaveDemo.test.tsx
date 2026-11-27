import { fireEvent, render, screen } from '@testing-library/react';
import {
  createMemoryRouter,
  MemoryRouter,
  Route,
  RouterProvider,
  Routes,
} from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { AuthProvider } from '../features/auth/AuthContext';
import { AppShell } from './AppShell';
import { UnsavedChangesGuard } from './UnsavedChangesGuard';

afterEach(() => {
  sessionStorage.clear();
  vi.unstubAllGlobals();
});

it.each(['OWNER', 'ACCOUNTANT', 'AUDITOR'])(
  'leaving as demo %s clears the demo role before opening the private workspace without an API logout',
  (role) => {
    sessionStorage.setItem('business-records-demo-role', role);
    const fetcher = vi.fn(() => {
      throw new Error('Demo must not call the API');
    });
    vi.stubGlobal('fetch', fetcher);
    render(
      <MemoryRouter initialEntries={['/demo/businesses']}>
        <Routes>
          <Route
            path="/demo/businesses"
            element={
              <AuthProvider mode="demo">
                <AppShell
                  contextLabel="Demo"
                  navigation={[]}
                  mobileNavigation={[]}
                />
              </AuthProvider>
            }
          />
          <Route path="/app/businesses" element={<p>Private workspace</p>} />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('link', { name: 'Leave demo' }));
    expect(screen.getByText('Private workspace')).toBeVisible();
    expect(sessionStorage.getItem('business-records-demo-role')).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  },
);

it('retains the demo role when an unsaved-changes guard cancels leaving', () => {
  sessionStorage.setItem('business-records-demo-role', 'ACCOUNTANT');
  const fetcher = vi.fn(() => {
    throw new Error('Demo must not call the API');
  });
  vi.stubGlobal('fetch', fetcher);
  const router = createMemoryRouter(
    [
      {
        path: '/demo/businesses',
        element: (
          <AuthProvider mode="demo">
            <UnsavedChangesGuard when />
            <AppShell
              contextLabel="Demo"
              navigation={[]}
              mobileNavigation={[]}
            />
          </AuthProvider>
        ),
      },
      { path: '/app/businesses', element: <p>Private workspace</p> },
    ],
    { initialEntries: ['/demo/businesses'] },
  );
  render(<RouterProvider router={router} />);
  fireEvent.click(screen.getByRole('link', { name: 'Leave demo' }));
  expect(screen.getByRole('dialog')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Stay on page' }));
  expect(sessionStorage.getItem('business-records-demo-role')).toBe(
    'ACCOUNTANT',
  );
  fireEvent.click(screen.getByRole('link', { name: 'Leave demo' }));
  fireEvent.click(screen.getByRole('button', { name: 'Leave without saving' }));
  expect(screen.getByText('Private workspace')).toBeVisible();
  expect(sessionStorage.getItem('business-records-demo-role')).toBeNull();
  expect(fetcher).not.toHaveBeenCalled();
});
