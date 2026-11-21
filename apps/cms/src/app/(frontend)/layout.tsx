import React from 'react';

import { FrontendShell } from './components/frontend-shell';

/** The maintenance page is English only */
export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return <FrontendShell lang="en">{children}</FrontendShell>;
}
