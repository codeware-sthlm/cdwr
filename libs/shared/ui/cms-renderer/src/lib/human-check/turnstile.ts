/** The slice of Cloudflare's widget api this uses. */
export type TurnstileApi = {
  render: (
    element: HTMLElement,
    options: {
      sitekey: string;
      theme?: 'light' | 'dark' | 'auto';
      callback?: (token: string) => void;
      'expired-callback'?: () => void;
      'error-callback'?: () => void;
    }
  ) => string | undefined;
  remove: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

// Explicit rather than implicit rendering: the widget belongs to a form that
// may mount and unmount several times on one page
const SCRIPT_URL =
  'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

let loading: Promise<TurnstileApi | null> | null = null;

/**
 * Fetch Cloudflare's widget script, once per page.
 *
 * Resolves `null` when there is no browser to load it into, or when the script
 * cannot be reached — a site whose visitor is offline or behind a filter still
 * renders its form, and the server refuses the submission that arrives without
 * a token.
 */
export function loadTurnstile(): Promise<TurnstileApi | null> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.resolve(null);
  }

  if (window.turnstile) {
    return Promise.resolve(window.turnstile);
  }

  if (loading) {
    return loading;
  }

  loading = new Promise<TurnstileApi | null>((resolve) => {
    const script = document.createElement('script');
    script.src = SCRIPT_URL;
    script.async = true;
    script.defer = true;
    script.addEventListener('load', () => resolve(window.turnstile ?? null));
    script.addEventListener('error', () => {
      // Cleared so a later form tries again rather than inheriting this failure
      loading = null;
      resolve(null);
    });
    document.head.appendChild(script);
  });

  return loading;
}
