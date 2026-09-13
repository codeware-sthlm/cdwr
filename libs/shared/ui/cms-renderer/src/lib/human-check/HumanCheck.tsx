'use client';

import { t } from '@codeware/shared/util/i18n';
import { useEffect, useRef, useState } from 'react';

import { usePayload } from '../providers/PayloadProvider';

import { loadTurnstile } from './turnstile';

type Props = {
  /** Where the honeypot's value is read from at submit time */
  honeypotRef: React.RefObject<HTMLInputElement | null>;
  /** Absent when the site has no key configured, so no widget is drawn */
  siteKey: string | null;
  theme: 'light' | 'dark' | 'auto';
  onToken: (token: string) => void;
  /**
   * Hands back a way to ask the widget for a fresh token, or `null` when there
   * is no widget to ask.
   */
  registerReset: (reset: (() => void) | null) => void;
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
export function HumanCheck({
  honeypotRef,
  onToken,
  registerReset,
  siteKey,
  theme
}: Props) {
  const container = useRef<HTMLDivElement>(null);
  const { locale } = usePayload();

  // Set when the widget will not arrive: the script was blocked or unreachable,
  // it could not draw, or it keeps erroring. Without saying so, the form looks
  // ready while its button can never open
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    if (!siteKey) {
      return;
    }

    let widgetId: string | undefined;
    let dropped = false;

    loadTurnstile()
      .then((turnstile) => {
        if (dropped) {
          return;
        }

        // Blocked by a content blocker, or offline
        if (!turnstile) {
          setUnavailable(true);
          return;
        }

        if (!container.current) {
          return;
        }

        const drawn = turnstile.render(container.current, {
          sitekey: siteKey,
          theme,
          // A widget that errored and then recovered is available again
          callback: (token) => {
            setUnavailable(false);
            onToken(token);
          },
          // A token is single-use and expires after a few minutes. Clearing
          // it makes a form left open ask for a fresh one instead of sending
          // one the server will refuse
          'expired-callback': () => onToken(''),
          'error-callback': () => {
            onToken('');
            setUnavailable(true);
          }
        });

        widgetId = drawn;

        if (drawn) {
          registerReset(() => turnstile.reset(drawn));
        }
      })
      // The script loaded but could not draw — a rejected site key, say
      .catch(() => {
        if (!dropped) {
          setUnavailable(true);
        }
      });

    return () => {
      dropped = true;
      registerReset(null);
      if (widgetId) {
        window.turnstile?.remove(widgetId);
      }
    };
  }, [onToken, registerReset, siteKey, theme]);

  return (
    <>
      {/* Not `display: none` — a script that skips hidden inputs would walk
          past the one field that identifies it */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-[-9999px] h-px w-px overflow-hidden opacity-0"
      >
        {/* Named so no autofill heuristic recognises it. `website`, `company`
            and the like are categories a browser fills from a saved profile,
            which would trip the honeypot on a real visitor */}
        <input
          ref={honeypotRef}
          type="text"
          name="cdwr-hp"
          tabIndex={-1}
          autoComplete="off"
          defaultValue=""
        />
      </div>
      {siteKey && <div ref={container} className="mt-4" />}
      {/* The button stays shut — sending without a token is only refused — but
          the visitor is told why, and what usually fixes it */}
      {siteKey && unavailable && (
        <p role="alert" className="text-destructive mt-2 text-sm">
          {t(locale, 'humanCheck.unavailable')}
        </p>
      )}
    </>
  );
}
