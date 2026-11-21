'use client';
import { Button } from '@codeware/shared/ui/shadcn/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@codeware/shared/ui/shadcn/components/dropdown-menu';
import { type SupportedLocale, t } from '@codeware/shared/util/i18n';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import * as React from 'react';

const capitalize = (text: string, locale: SupportedLocale) =>
  text.charAt(0).toLocaleUpperCase(locale) + text.slice(1);

export function ColorSchemeToggle({ locale }: { locale: SupportedLocale }) {
  const { setTheme: setColorScheme } = useTheme();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon">
          <Sun className="h-[1.2rem] w-[1.2rem] scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90" />
          <Moon className="absolute h-[1.2rem] w-[1.2rem] scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0" />
          <span className="sr-only">{t(locale, 'colorScheme.select')}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => setColorScheme('light')}>
          {capitalize(t(locale, 'colorScheme.light'), locale)}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setColorScheme('dark')}>
          {capitalize(t(locale, 'colorScheme.dark'), locale)}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setColorScheme('system')}>
          {capitalize(t(locale, 'colorScheme.system'), locale)}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
