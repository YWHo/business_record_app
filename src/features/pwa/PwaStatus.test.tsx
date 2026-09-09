import { fireEvent, render, screen } from '@testing-library/react';
import { PwaStatus } from './PwaStatus';

describe('PwaStatus', () => {
  afterEach(() => vi.restoreAllMocks());

  it('explains the offline shell limitation without implying queued writes', () => {
    vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false);
    render(<PwaStatus />);

    expect(screen.getByText('You are offline')).toBeInTheDocument();
    expect(
      screen.getByText(/changes are not queued offline/i),
    ).toBeInTheDocument();
  });

  it('offers an explicit refresh when a service-worker update is ready', () => {
    vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(true);
    render(<PwaStatus />);
    fireEvent(
      window,
      new CustomEvent('business-records:pwa-status', {
        detail: 'update-available',
      }),
    );

    expect(screen.getByText(/app update is ready/i)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Update now' }),
    ).toBeInTheDocument();
  });
});
