'use client';

import { useCallback, useRef, useState } from 'react';

import { usePayload } from '../providers/PayloadProvider';
import type { HumanCheckProof } from '../providers/PayloadProvider';

import { HumanCheck } from './HumanCheck';

type Options = {
  /**
   * A form drawn as an example posts nowhere, so it neither draws a widget nor
   * loads Cloudflare's script — which keeps a third party out of the gallery
   * and out of the snapshots it is captured in.
   */
  disabled?: boolean;
};

/**
 * Everything a form needs to prove a person filled it in.
 *
 * Returns what to render inside the form, what to send with the submission,
 * and whether the check has been satisfied — so the submit button can wait for
 * a widget that has not been solved yet rather than posting into a refusal.
 */
export function useHumanCheck({ disabled }: Options = {}) {
  const { colorScheme, humanCheckSiteKey } = usePayload();
  const honeypotRef = useRef<HTMLInputElement>(null);
  const [token, setToken] = useState('');

  // When the visitor was first shown the form, on a clock that only counts
  // forward and belongs to this page. A script that posts the moment it parses
  // the page cannot make the gap look like time spent typing. It is forgeable,
  // so the server only consults it where no Turnstile key is configured
  const drawnAt = useRef(performance.now());

  const siteKey = disabled ? null : (humanCheckSiteKey ?? null);

  const onToken = useCallback((next: string) => setToken(next), []);

  const resetWidget = useRef<(() => void) | null>(null);
  const registerReset = useCallback((reset: (() => void) | null) => {
    resetWidget.current = reset;
  }, []);

  /**
   * Throw the spent token away and ask for another.
   *
   * A Turnstile token may be verified once. Both forms stay mounted after a
   * submission, so without this a second attempt would send the token the
   * first one spent, and the server would refuse it as a replay — which reads
   * as the form breaking after one use.
   */
  const reset = useCallback(() => {
    setToken('');
    resetWidget.current?.();
  }, []);

  const proof = useCallback(
    (): HumanCheckProof => ({
      token,
      honeypot: honeypotRef.current?.value ?? '',
      elapsedMs: Math.round(performance.now() - drawnAt.current)
    }),
    [token]
  );

  return {
    /** Render inside the form element */
    fields: (
      <HumanCheck
        honeypotRef={honeypotRef}
        registerReset={registerReset}
        siteKey={siteKey}
        theme={
          colorScheme === 'dark'
            ? 'dark'
            : colorScheme === 'light'
              ? 'light'
              : 'auto'
        }
        onToken={onToken}
      />
    ),
    /** Read when the form is sent */
    proof,
    /** Call after every attempt, so the next one carries a fresh token */
    reset,
    /** False only while a drawn widget is waiting to be solved */
    solved: !siteKey || token !== ''
  };
}
