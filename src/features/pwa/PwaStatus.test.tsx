import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PwaStatus } from './PwaStatus';

describe('PwaStatus', () => {
  beforeEach(() => {
    window.localStorage.clear();
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn().mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Reflect.deleteProperty(navigator, 'getInstalledRelatedApps');
  });

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

  it('does not offer installation when the browser reports this PWA is installed', async () => {
    Object.defineProperty(navigator, 'getInstalledRelatedApps', {
      configurable: true,
      value: vi.fn().mockResolvedValue([{ platform: 'webapp' }]),
    });
    render(<PwaStatus />);

    fireEvent(window, new Event('beforeinstallprompt', { cancelable: true }));

    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Install app' }),
      ).not.toBeInTheDocument(),
    );
    expect(window.localStorage.getItem('business-records:pwa-installed')).toBe(
      'true',
    );
  });

  it('remembers installation for later browser tabs on the same origin', async () => {
    render(<PwaStatus />);
    fireEvent(window, new Event('appinstalled'));
    fireEvent(window, new Event('beforeinstallprompt', { cancelable: true }));

    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Install app' }),
      ).not.toBeInTheDocument(),
    );
    expect(window.localStorage.getItem('business-records:pwa-installed')).toBe(
      'true',
    );
  });

  it('still offers installation when no installation is detected', async () => {
    render(<PwaStatus />);
    fireEvent(window, new Event('beforeinstallprompt', { cancelable: true }));

    expect(
      await screen.findByRole('button', { name: 'Install app' }),
    ).toBeInTheDocument();
  });

  it('clears a stale marker when the browser reports the PWA is not installed', async () => {
    window.localStorage.setItem('business-records:pwa-installed', 'true');
    Object.defineProperty(navigator, 'getInstalledRelatedApps', {
      configurable: true,
      value: vi.fn().mockResolvedValue([]),
    });
    render(<PwaStatus />);
    fireEvent(window, new Event('beforeinstallprompt', { cancelable: true }));

    expect(
      await screen.findByRole('button', { name: 'Install app' }),
    ).toBeInTheDocument();
    expect(
      window.localStorage.getItem('business-records:pwa-installed'),
    ).toBeNull();
  });
});
