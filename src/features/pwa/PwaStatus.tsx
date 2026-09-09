import { useEffect, useState } from 'react';

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

type ServiceWorkerMessage = 'offline-ready' | 'update-available' | 'error';

export function PwaStatus() {
  const [online, setOnline] = useState(() => navigator.onLine);
  const [message, setMessage] = useState<ServiceWorkerMessage | null>(null);
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(
    null,
  );

  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    const onInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    const onInstalled = () => setInstallPrompt(null);
    const onPwaMessage = (event: Event) => {
      setMessage((event as CustomEvent<ServiceWorkerMessage>).detail);
    };

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    window.addEventListener('beforeinstallprompt', onInstallPrompt);
    window.addEventListener('appinstalled', onInstalled);
    window.addEventListener('business-records:pwa-status', onPwaMessage);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('beforeinstallprompt', onInstallPrompt);
      window.removeEventListener('appinstalled', onInstalled);
      window.removeEventListener('business-records:pwa-status', onPwaMessage);
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

  if (installPrompt) {
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
