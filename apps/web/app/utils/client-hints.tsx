/**
 * This file contains utilities for using client hints for user preference which
 * are needed by the server, but are only known by the browser.
 */
import { getHintUtils } from '@epic-web/client-hints';
import {
  clientHint as colourSchemeHint,
  subscribeToSchemeChange
} from '@epic-web/client-hints/color-scheme';
import { useRevalidator } from '@remix-run/react';
import * as React from 'react';

const hintsUtils = getHintUtils({ colorScheme: colourSchemeHint });

export const { getHints } = hintsUtils;

/**
 * Client hint check script
 *
 * @returns inline script element that checks for client hints and sets cookies
 * if they are not set then reloads the page if any cookie was set to an
 * inaccurate value.
 */
export function ClientHintCheck({ nonce }: { nonce?: string }) {
  const { revalidate } = useRevalidator();
  // Subscribe to colour scheme preference changes to revalidate the page
  React.useEffect(
    () => subscribeToSchemeChange(() => revalidate()),
    [revalidate]
  );

  return (
    <script
      nonce={nonce}
      dangerouslySetInnerHTML={{
        __html: hintsUtils.getClientHintCheckScript()
      }}
    />
  );
}
