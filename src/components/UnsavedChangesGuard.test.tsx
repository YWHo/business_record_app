import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { createMemoryRouter, Link, RouterProvider } from 'react-router-dom';
import { FormError } from './FormError';
import { UnsavedChangesGuard } from './UnsavedChangesGuard';

function EditablePage() {
  const [dirty, setDirty] = useState(false);

  return (
    <>
      <h1>Edit record</h1>
      <label htmlFor="record-name">Name</label>
      <input
        id="record-name"
        onChange={() => setDirty(true)}
        defaultValue="Original"
      />
      <Link to="/next">Next page</Link>
      <UnsavedChangesGuard when={dirty} />
    </>
  );
}

describe('UnsavedChangesGuard', () => {
  it('keeps focus in the confirmation and lets the user stay or leave', () => {
    const router = createMemoryRouter(
      [
        { path: '/edit', element: <EditablePage /> },
        { path: '/next', element: <h1>Next page</h1> },
      ],
      { initialEntries: ['/edit'] },
    );
    render(<RouterProvider router={router} />);

    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: 'Changed' },
    });
    fireEvent.click(screen.getByRole('link', { name: 'Next page' }));

    const dialog = screen.getByRole('dialog', {
      name: 'Discard unsaved changes?',
    });
    const stay = screen.getByRole('button', { name: 'Stay on page' });
    const leave = screen.getByRole('button', {
      name: 'Leave without saving',
    });
    expect(stay).toHaveFocus();

    leave.focus();
    fireEvent.keyDown(dialog, { key: 'Tab' });
    expect(stay).toHaveFocus();
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
    expect(leave).toHaveFocus();
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Edit record' })).toBeVisible();

    fireEvent.click(screen.getByRole('link', { name: 'Next page' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Leave without saving' }),
    );
    expect(screen.getByRole('heading', { name: 'Next page' })).toBeVisible();
  });
});

describe('FormError', () => {
  it('moves focus to a newly displayed form error', () => {
    const { rerender } = render(<FormError message="" />);
    rerender(<FormError message="Unable to save this record." />);

    expect(screen.getByRole('alert')).toHaveFocus();
  });
});
