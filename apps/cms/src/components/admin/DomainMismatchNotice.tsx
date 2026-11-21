import { headers } from 'next/headers';
import type { ServerProps } from 'payload';
import React from 'react';

import { DomainMismatchNoticeClient } from './DomainMismatchNotice.client';

/**
 * Warn when the admin is reached on a host this deployment refuses cookies from.
 *
 * `extractJWT` drops the session cookie for any origin outside `config.csrf`,
 * which leaves the admin rendering as though logged out — collections hidden by
 * their `admin.hidden` role check, an editor's role in the sidebar, and a logout
 * that cannot complete. Nothing in the UI says why, so this does.
 *
 * Server-side on purpose: it compares against `csrf`, which never reaches the
 * browser, and against the live `serverURL` that adoption assigns in `onInit`.
 * Payload caches the browser's copy per language, so that copy can be one
 * built before adoption (`dropStaleClientConfigs` drops such entries).
 */
const DomainMismatchNotice: React.FC<ServerProps> = async ({ payload }) => {
  if (!payload) {
    return null;
  }

  const headerList = await headers();
  const host = headerList.get('host');

  if (!host) {
    return null;
  }

  const { config } = payload;
  const protocol = headerList.get('x-forwarded-proto') ?? 'https';
  const origin = `${protocol}://${host}`;

  const trusted = new Set(
    [config.serverURL, ...(config.csrf ?? [])].filter(Boolean)
  );

  if (trusted.has(origin)) {
    return null;
  }

  return (
    <DomainMismatchNoticeClient origin={origin} expected={config.serverURL} />
  );
};

export default DomainMismatchNotice;
