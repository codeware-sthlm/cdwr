'use client';

import { useEffect, useRef } from 'react';

import { loadTurnstile } from './turnstile';

type Props = {
  /** Where the honeypot's value is read from at submit time */
  honeypotRef: React.RefObject<HTMLInputElement | null>;
  /** Absent when the site has no key configured, so no widget is drawn */
  siteKey: string | null;
  theme: 'light' | 'dark' | 'auto';
  onToken: (token: string) => void;
};

/**
 * What a form carries so the server can tell a person from a script.
 *
 * Two parts. The honeypot is always there and costs nothing: a field placed
 * out of sight, out of the tab order and out of the accessibility tree, so
 * anything found in it was put there by something filling in every input it
 * could see.
 *
 * The Turnstile widget is drawn only where a site key is configured. A site
 * without one still has the honeypot and the clock.
 */
export function HumanCheck({ honeypotRef, onToken, siteKey, theme }: Props) {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!siteKey) {
      return;
    }

    let widgetId: string | undefined;
    let dropped = false;

    loadTurnstile().then((turnstile) => {
      if (!turnstile || dropped || !container.current) {
        return;
      }

      widgetId = turnstile.render(container.current, {
        sitekey: siteKey,
        theme,
        callback: onToken,
        // A token is single-use and expires after a few minutes. Both paths
        // clear it, so a form left open asks for a fresh one instead of
        // sending one the server will refuse
        'expired-callback': () => onToken(''),
        'error-callback': () => onToken('')
      });
    });

    return () => {
      dropped = true;
      if (widgetId) {
        window.turnstile?.remove(widgetId);
      }
    };
  }, [onToken, siteKey, theme]);

  return (
    <>
      {/* Not `display: none` — a script that skips hidden inputs would walk
          past the one field that identifies it */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-[-9999px] h-px w-px overflow-hidden opacity-0"
      >
        <input
          ref={honeypotRef}
          type="text"
          name="website"
          tabIndex={-1}
          autoComplete="off"
          defaultValue=""
        />
      </div>
      {siteKey && <div ref={container} className="mt-4" />}
    </>
  );
}
