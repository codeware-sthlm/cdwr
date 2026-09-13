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
  const { colorScheme, humanCheck } = usePayload();
  const honeypotRef = useRef<HTMLInputElement>(null);
  const [token, setToken] = useState('');

  // When the visitor was first shown the form. A script that posts the moment
  // it parses the page cannot make this look like time spent typing — it is
  // forgeable, which is why Turnstile sits on top of it rather than behind it
  const drawnAt = useRef(Date.now());

  const siteKey = disabled ? null : (humanCheck?.siteKey ?? null);

  const onToken = useCallback((next: string) => setToken(next), []);

  const proof = useCallback(
    (): HumanCheckProof => ({
      token,
      honeypot: honeypotRef.current?.value ?? '',
      drawnAt: drawnAt.current
    }),
    [token]
  );

  return {
    /** Render inside the form element */
    fields: (
      <HumanCheck
        honeypotRef={honeypotRef}
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
    /** False only while a drawn widget is waiting to be solved */
    solved: !siteKey || token !== ''
  };
}
