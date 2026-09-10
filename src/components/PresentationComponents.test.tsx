import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { BackupReminderView } from '../features/exports/BackupReminder';
import { DashboardMetricCard } from './DashboardMetricCard';
import { StatusBadge } from './StatusBadge';

describe('reusable presentation components', () => {
  it('formats workflow status names and applies their visual state class', () => {
    render(<StatusBadge status="MISSING_INFORMATION" />);
    expect(screen.getByText('Missing information')).toHaveClass(
      'status-badge',
      'missing_information',
    );
  });

  it('lets a status retain semantic text when a longer label is needed', () => {
    render(
      <StatusBadge status="READY_FOR_REVIEW">
        Ready for accountant review
      </StatusBadge>,
    );
    expect(screen.getByText('Ready for accountant review')).toBeInTheDocument();
  });

  it('exposes a dashboard metric as a labelled article', () => {
    render(
      <DashboardMetricCard
        label="Net cash movement"
        value="$250.00"
        note="Cash received less recorded expenses"
      />,
    );
    expect(
      screen.getByRole('article', { name: 'Net cash movement' }),
    ).toHaveTextContent('$250.00');
  });

  it('distinguishes due and current backup actions in text', () => {
    const { rerender } = render(
      <MemoryRouter>
        <BackupReminderView
          backup={{ reminderDays: 30, lastSuccessfulExportAt: null, due: true }}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText('Local backup due')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back up now' })).toHaveAttribute(
      'href',
      '/exports',
    );

    rerender(
      <MemoryRouter>
        <BackupReminderView
          backup={{
            reminderDays: 30,
            lastSuccessfulExportAt: '2026-09-09T08:30:00.000Z',
            due: false,
          }}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText('Local backup current')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Open exports' }),
    ).toBeInTheDocument();
  });
});
