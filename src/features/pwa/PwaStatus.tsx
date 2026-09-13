import { useEffect, useState } from 'react';

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface NavigatorWithPwaInstallation extends Navigator {
  standalone?: boolean;
  getInstalledRelatedApps?: () => Promise<Array<{ platform?: string }>>;
}

type ServiceWorkerMessage = 'offline-ready' | 'update-available' | 'error';

const INSTALLED_STORAGE_KEY = 'business-records:pwa-installed';

function isStandalone() {
  const navigatorWithPwa = navigator as NavigatorWithPwaInstallation;
  return (
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    navigatorWithPwa.standalone === true
  );
}

function hasInstalledMarker() {
  try {
    return window.localStorage.getItem(INSTALLED_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

function rememberInstallation() {
  try {
    window.localStorage.setItem(INSTALLED_STORAGE_KEY, 'true');
  } catch {
    // Storage can be unavailable in privacy-restricted browsing contexts.
  }
}

function forgetInstallation() {
  try {
    window.localStorage.removeItem(INSTALLED_STORAGE_KEY);
  } catch {
    // Storage can be unavailable in privacy-restricted browsing contexts.
  }
}

async function browserReportsInstallation() {
  const getInstalledRelatedApps = (navigator as NavigatorWithPwaInstallation)
    .getInstalledRelatedApps;
  if (!getInstalledRelatedApps) return null;

  try {
    const apps = await getInstalledRelatedApps.call(navigator);
    return apps.some((app) => app.platform === 'webapp');
  } catch {
    return null;
  }
}

export function PwaStatus() {
  const [online, setOnline] = useState(() => navigator.onLine);
  const [message, setMessage] = useState<ServiceWorkerMessage | null>(null);
  const [installed, setInstalled] = useState(
    () => isStandalone() || hasInstalledMarker(),
  );
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(
    null,
  );

  useEffect(() => {
    let active = true;
    const recordInstallation = () => {
      rememberInstallation();
      setInstalled(true);
      setInstallPrompt(null);
    };
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    const onInstallPrompt = (event: Event) => {
      event.preventDefault();
      if (isStandalone()) {
        recordInstallation();
        return;
      }

      void browserReportsInstallation().then((browserInstalled) => {
        if (!active) return;
        if (browserInstalled) {
          recordInstallation();
          return;
        }
        if (browserInstalled === false) {
          forgetInstallation();
          setInstalled(false);
        } else if (hasInstalledMarker()) {
          recordInstallation();
          return;
        }
        setInstallPrompt(event as InstallPromptEvent);
      });
    };
    const onInstalled = () => recordInstallation();
    const displayMode = window.matchMedia?.('(display-mode: standalone)');
    const onDisplayModeChange = () => {
      if (isStandalone()) recordInstallation();
    };
    const onPwaMessage = (event: Event) => {
      setMessage((event as CustomEvent<ServiceWorkerMessage>).detail);
    };

    if (isStandalone()) recordInstallation();
    else {
      void browserReportsInstallation().then((browserInstalled) => {
        if (active && browserInstalled) recordInstallation();
        else if (active && browserInstalled === false) {
          forgetInstallation();
          setInstalled(false);
        }
      });
    }

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    window.addEventListener('beforeinstallprompt', onInstallPrompt);
    window.addEventListener('appinstalled', onInstalled);
    window.addEventListener('business-records:pwa-status', onPwaMessage);
    displayMode?.addEventListener('change', onDisplayModeChange);
    return () => {
      active = false;
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('beforeinstallprompt', onInstallPrompt);
      window.removeEventListener('appinstalled', onInstalled);
      window.removeEventListener('business-records:pwa-status', onPwaMessage);
      displayMode?.removeEventListener('change', onDisplayModeChange);
    };
  }, []);

  if (!online) {
    return (
      <aside className="pwa-status offline" role="status">
        <div>
          <strong>You are offline</strong>
          <span>
            The app shell is available, but records and uploads need a
            connection. Changes are not queued offline.
          </span>
        </div>
      </aside>
    );
  }

  if (message === 'update-available') {
    return (
      <aside className="pwa-status" role="status">
        <div>
          <strong>An app update is ready</strong>
          <span>Refresh when convenient to use the latest version.</span>
        </div>
        <div className="pwa-status-actions">
          <button
            type="button"
            onClick={() =>
              window.dispatchEvent(
                new Event('business-records:apply-pwa-update'),
              )
            }
          >
            Update now
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={() => setMessage(null)}
          >
            Later
          </button>
        </div>
      </aside>
    );
  }

  if (message === 'offline-ready' || message === 'error') {
    return (
      <aside
        className={`pwa-status ${message === 'error' ? 'error' : ''}`}
        role="status"
      >
        <span>
          {message === 'offline-ready'
            ? 'The app shell is ready for offline use.'
            : 'Offline setup was unavailable. Online use is unaffected.'}
        </span>
        <button
          type="button"
          className="secondary-button"
          onClick={() => setMessage(null)}
        >
          Dismiss
        </button>
      </aside>
    );
  }

  if (installPrompt && !installed) {
    return (
      <aside className="pwa-status" role="status">
        <span>Install Business Records for quicker access on this device.</span>
        <button
          type="button"
          onClick={() => {
            void installPrompt.prompt().then(async () => {
              await installPrompt.userChoice;
              setInstallPrompt(null);
            });
          }}
        >
          Install app
        </button>
      </aside>
    );
  }

  return null;
}
