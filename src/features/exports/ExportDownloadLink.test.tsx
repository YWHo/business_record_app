import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ExportDownloadLink } from './ExportDownloadLink';
describe('export download capabilities', () => {
  it('offers portable backups to owners', () => {
    render(
      <ExportDownloadLink
        role="OWNER"
        href="/api/exports/archive?scope=FULL"
      />,
    );
    expect(
      screen.getByRole('link', { name: 'Download portable ZIP' }),
    ).toHaveAttribute('href', '/api/exports/archive?scope=FULL');
  });
  it('offers report CSVs to accountants', () => {
    render(
      <ExportDownloadLink
        role="ACCOUNTANT"
        href="/api/reports/export?scope=FULL"
      />,
    );
    expect(
      screen.getByRole('link', { name: 'Download summary CSV' }),
    ).toHaveAttribute('href', '/api/reports/export?scope=FULL');
  });
  it.each(['AUDITOR', 'UNKNOWN', null])(
    'hides download actions for %s',
    (role) => {
      render(
        <ExportDownloadLink
          role={role}
          href="/api/reports/export?scope=FULL"
        />,
      );
      expect(screen.queryByRole('link')).not.toBeInTheDocument();
      expect(
        screen.getByText('Report downloads are not enabled for this access.'),
      ).toBeVisible();
    },
  );
});
