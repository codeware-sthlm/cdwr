import { t } from '@codeware/shared/util/i18n';
import { headers } from 'next/headers';
import React from 'react';

import './globals.css';
import { ColorSchemeToggle } from '../(frontend)/components/ColorSchemeToggle.client';
import { ThemeProvider } from '../(frontend)/components/theme-provider';
import { NONCE_HEADER } from '../../utils/csp';
import { LANGUAGE_COOKIE, getRequestLocale } from '../../utils/request-locale';

import { LanguageSwitch } from './LanguageSwitch.client';

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
          <header className="flex items-center justify-end gap-3 p-6 sm:p-8">
            <LanguageSwitch
              current={locale}
              cookieName={LANGUAGE_COOKIE}
              label={t(locale, 'language.label')}
            />
            <ColorSchemeToggle />
          </header>
          <main className="mx-auto flex w-full flex-1 flex-col justify-center p-6 sm:p-8">
            {children}
          </main>
          <footer className="text-muted-foreground p-6 text-center text-sm sm:p-8">
            <a
              className="hover:text-foreground"
              href="https://cdwr.io"
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
