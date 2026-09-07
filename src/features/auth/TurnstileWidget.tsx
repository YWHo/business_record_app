import { useEffect, useId } from 'react';

interface TurnstileApi {
  render: (
    target: string,
    options: {
      sitekey: string;
      action: string;
      callback: (token: string) => void;
      'expired-callback': () => void;
    },
  ) => string;
  remove: (widgetId: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let scriptPromise: Promise<void> | null = null;

function loadTurnstile(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src =
      'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Challenge could not be loaded.'));
    document.head.append(script);
  });
  return scriptPromise;
}

export function TurnstileWidget({
  siteKey,
  onToken,
}: {
  siteKey: string;
  onToken: (token: string) => void;
}) {
  const reactId = useId();
  const elementId = `turnstile-${reactId.replaceAll(':', '')}`;
  useEffect(() => {
    let widgetId: string | undefined;
    let active = true;

    void loadTurnstile().then(() => {
      if (!active || !window.turnstile) return;
      widgetId = window.turnstile.render(`#${elementId}`, {
        sitekey: siteKey,
        action: 'login',
        callback: onToken,
        'expired-callback': () => onToken(''),
      });
    });

    return () => {
      active = false;
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId);
    };
  }, [elementId, onToken, siteKey]);

  return <div id={elementId} aria-label="Security challenge" />;
}
