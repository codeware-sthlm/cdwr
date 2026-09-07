'use client';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger
} from '@codeware/shared/ui/shadcn/components/dropdown-menu';
import { t } from '@codeware/shared/util/i18n';
import { PaletteIcon } from 'lucide-react';

import { usePayload } from '../providers/PayloadProvider';

import { controlChrome } from './chrome';

/**
 * Theme selector for sites offering more than one theme.
 *
 * Styled with the `--core-action-btn-*` tokens so it reads as a sibling of
 * ColorSchemeSwitch rather than a form control dropped into the header.
 *
 * Switching is a server round trip — `setTheme` persists the choice and the
 * host re-renders — so the document's `data-theme` and the server agree and
 * the next load does not flash.
 */
export function ThemeSelect() {
  const { chrome, locale, setTheme, theme, themes } = usePayload();

  if (themes.length < 2) {
    return null;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t(locale, 'theme.select')}
        title={t(locale, 'theme.select')}
        className={controlChrome({ chrome })}
      >
        <PaletteIcon className="stroke-core-action-btn-foreground fill-core-action-btn-icon-fill group-hover:stroke-core-action-btn-foreground-hover size-6 stroke-[1.5] transition" />
        <span className="sr-only">{t(locale, 'theme.select')}</span>
      </DropdownMenuTrigger>
      {/*
        Sized to its own content, not the trigger. The shadcn default pins a
        menu to `--radix-dropdown-menu-trigger-width`, which suits a combobox
        but not this round icon button — it collapsed every menu to the
        `min-w-32` floor and wrapped any theme name past a word or two.
      */}
      <DropdownMenuContent align="end" className="w-auto max-w-64">
        <DropdownMenuRadioGroup value={theme} onValueChange={setTheme}>
          {themes.map(({ value, label }) => (
            <DropdownMenuRadioItem key={value} value={value}>
              {label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
