import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { BackupReminderView } from '../features/exports/BackupReminder';
import { BusinessCard } from './BusinessCard';
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

  it('keeps business and current legal entity identity visible', () => {
    render(
      <MemoryRouter>
        <BusinessCard
          business={{
            id: 'business-ride',
            name: 'Uber Ride',
            description: 'Ride-hailing',
            businessType: 'PLATFORM_SERVICES',
            defaultCurrency: 'NZD',
            status: 'ACTIVE',
            legacyBusinessActivityId: 'activity-ride',
            currentLegalEntity: {
              id: 'entity-taxi',
              entityType: 'LIMITED_COMPANY',
              legalName: 'Taxi Limited',
              tradingName: null,
              status: 'ACTIVE',
              attributionReviewRequired: false,
            },
            recordCount: 96,
            lastRecordUpdatedAt: '2026-09-09T00:00:00.000Z',
          }}
        />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole('article', { name: 'Uber Ride' }),
    ).toHaveTextContent('Ride-hailing');
    expect(screen.getByText('Taxi Limited')).toBeInTheDocument();
    expect(screen.getByText('Limited company')).toBeInTheDocument();
    expect(screen.getByText('96 records')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Open Uber Ride' }),
    ).toHaveAttribute('href', '/app/businesses/business-ride');
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
      '/app/reports',
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
