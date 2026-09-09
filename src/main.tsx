import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { registerSW } from 'virtual:pwa-register';
import { App } from './App';
import { AuthProvider } from './features/auth/AuthContext';
import './styles.css';

const publishPwaStatus = (
  detail: 'offline-ready' | 'update-available' | 'error',
) =>
  window.dispatchEvent(
    new CustomEvent('business-records:pwa-status', { detail }),
  );

const updateServiceWorker = registerSW({
  immediate: true,
  onOfflineReady: () => publishPwaStatus('offline-ready'),
  onNeedRefresh: () => publishPwaStatus('update-available'),
  onRegisterError: () => publishPwaStatus('error'),
  onRegisteredSW: (_serviceWorkerUrl, registration) => {
    if (!registration) return;
    window.addEventListener('focus', () => {
      void registration.update().catch(() => publishPwaStatus('error'));
    });
  },
});

window.addEventListener('business-records:apply-pwa-update', () => {
  void updateServiceWorker(true);
});

const root = document.getElementById('root');

if (!root) {
  throw new Error('Application root element was not found.');
}

createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
