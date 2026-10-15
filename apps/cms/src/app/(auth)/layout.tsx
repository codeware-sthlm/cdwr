import { headers } from 'next/headers';
import React from 'react';

import './globals.css';
import { ColorSchemeToggle } from '../(frontend)/components/ColorSchemeToggle.client';
import { ThemeProvider } from '../(frontend)/components/theme-provider';
import { NONCE_HEADER } from '../../utils/csp';
import { getRequestLocale } from '../../utils/request-locale';

/** Shell for the platform's auth pages, themed like the admin */
export default async function AuthLayout({
  children
}: {
  children: React.ReactNode;
}) {
  // Set by the proxy for the inline theme script. Reading it also renders
  // these pages per request, which a nonce needs
  const nonce = (await headers()).get(NONCE_HEADER) ?? undefined;
  const locale = await getRequestLocale();

  return (
    <html lang={locale} suppressHydrationWarning>
      <body className="bg-background text-foreground flex min-h-screen flex-col font-sans antialiased">
        <ThemeProvider
          attribute="data-theme"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
          nonce={nonce}
        >
          <header className="flex justify-end p-6 sm:p-8">
            <ColorSchemeToggle />
          </header>
          <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center p-6 sm:p-8">
            {children}
          </main>
          <footer className="text-muted-foreground p-6 text-center text-sm sm:p-8">
            <a
              className="hover:text-foreground"
              href="https://github.com/codeware-sthlm/cdwr/tree/main/README.md"
              rel="noopener noreferrer"
              target="_blank"
            >
              @cdwr
            </a>
          </footer>
        </ThemeProvider>
      </body>
    </html>
  );
}
