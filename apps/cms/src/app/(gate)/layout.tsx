import React from 'react';

import { FrontendShell } from '../(frontend)/components/frontend-shell';
import { getAcceptedLocale } from '../../utils/request-locale';

/**
 * The gate page's own root layout, so `<html lang>` can follow the visitor
 * while the maintenance page stays English. The URL stays `/site-gate`.
 */
export default async function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  const lang = await getAcceptedLocale();

  return <FrontendShell lang={lang}>{children}</FrontendShell>;
}
