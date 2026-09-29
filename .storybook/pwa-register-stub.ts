type RegisterOptions = {
  onOfflineReady?: () => void;
  onNeedRefresh?: () => void;
  onRegisterError?: (error: unknown) => void;
  onRegisteredSW?: (
    serviceWorkerUrl: string,
    registration: ServiceWorkerRegistration | undefined,
  ) => void;
};

export function registerSW(options: RegisterOptions = {}) {
  void options;
  return (reloadPage = false) => {
    void reloadPage;
    return Promise.resolve();
  };
}
