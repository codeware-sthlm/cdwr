import { cn } from '@codeware/shared/util/ui';
import { Inter } from 'next/font/google';
import { headers } from 'next/headers';
import React from 'react';

import './globals.css';
import { NONCE_HEADER } from '../../utils/csp';
import { ColorSchemeToggle } from './components/ColorSchemeToggle.client';
import { ThemeProvider } from './components/theme-provider';

const inter = Inter({ subsets: ['latin'] });

export default async function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  // Set by the proxy for the inline theme script. Reading it also renders
  // these pages per request, which a nonce needs: maintenance mode rewrites
  // every route here
  const nonce = (await headers()).get(NONCE_HEADER) ?? undefined;

  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={cn(
          'bg-cdwr-light-gray/50 dark:text-cdwr-light-gray text-cdwr-space-cadet dark:bg-cdwr-darker-black flex min-h-screen flex-col',
          inter.className
        )}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
          nonce={nonce}
        >
          <header className="flex justify-end p-6 sm:p-8">
            <ColorSchemeToggle />
          </header>
          <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center p-6 sm:p-8">
            {children}
          </main>
          <footer className="mx-auto flex flex-wrap justify-center gap-4 p-6 text-sm opacity-70 hover:opacity-100 hover:transition-opacity sm:flex-nowrap sm:gap-8 sm:p-8">
            <a
              className="relative after:absolute after:bottom-0 after:left-0 after:h-px after:w-full after:origin-right after:scale-x-0 after:bg-current after:transition-transform after:duration-300 hover:after:origin-left hover:after:scale-x-100"
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
