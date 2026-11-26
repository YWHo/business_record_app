import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { expect, it } from 'vitest';
import { Link, NavLink, useNavigate } from './workspaceRouting';
import { WorkspaceEntryLink } from '../components/WorkspaceEntryLink';

function Navigation() {
  const navigate = useNavigate();
  const location = useLocation();
  return (
    <>
      <p data-testid="path">
        {location.pathname}
        {location.search}
      </p>
      <Link to="/app/businesses/uber/income?q=statement#records">Income</Link>
      <Link
        to={{ pathname: '/app/businesses/uber/documents', search: '?type=PDF' }}
      >
        Documents
      </Link>
      <NavLink to="/app/businesses" end>
        Directory
      </NavLink>
      <button onClick={() => void navigate('/app/businesses/uber/mileage')}>
        Mileage
      </button>
      <button onClick={() => void navigate('/login')}>Choose role</button>
      <WorkspaceEntryLink demo workspace />
    </>
  );
}
it('keeps internal links and imperative navigation inside /demo while leaving explicitly for /app', async () => {
  render(
    <MemoryRouter initialEntries={['/demo/businesses']}>
      <Routes>
        <Route path="*" element={<Navigation />} />
      </Routes>
    </MemoryRouter>,
  );
  expect(screen.getByRole('link', { name: 'Income' })).toHaveAttribute(
    'href',
    '/demo/businesses/uber/income?q=statement#records',
  );
  expect(screen.getByRole('link', { name: 'Documents' })).toHaveAttribute(
    'href',
    '/demo/businesses/uber/documents?type=PDF',
  );
  expect(screen.getByRole('link', { name: 'Directory' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  fireEvent.click(screen.getByRole('button', { name: 'Mileage' }));
  expect(await screen.findByTestId('path')).toHaveTextContent(
    '/demo/businesses/uber/mileage',
  );
  fireEvent.click(screen.getByRole('button', { name: 'Choose role' }));
  expect(screen.getByTestId('path')).toHaveTextContent('/demo');
  expect(screen.getByRole('link', { name: 'Leave demo' })).toHaveAttribute(
    'href',
    '/app/businesses',
  );
});
it('keeps private workspace links under /app', () => {
  render(
    <MemoryRouter initialEntries={['/app/businesses']}>
      <Navigation />
    </MemoryRouter>,
  );
  expect(screen.getByRole('link', { name: 'Documents' })).toHaveAttribute(
    'href',
    '/app/businesses/uber/documents?type=PDF',
  );
});
