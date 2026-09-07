'use client';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger
} from '@codeware/shared/ui/shadcn/components/dropdown-menu';
import {
  ToggleGroup,
  ToggleGroupItem
} from '@codeware/shared/ui/shadcn/components/toggle-group';
import { t } from '@codeware/shared/util/i18n';
import { PaletteIcon } from 'lucide-react';

import { usePayload } from '../providers/PayloadProvider';

import {
  controlChrome,
  controlIcon,
  segment,
  segmentLimit,
  segmentTrack
} from './chrome';

/**
 * Theme selector for sites offering more than one theme.
 *
 * Styled with the `--core-action-btn-*` tokens so it reads as a sibling of
 * ColorSchemeSwitch rather than a form control dropped into the header.
 *
 * Switching is a server round trip — `setTheme` persists the choice and the
 * host re-renders — so the document's `data-theme` and the server agree and
 * the next load does not flash.
 *
 * `flat` shows the themes inline while they fit; `outlined` keeps the menu.
 * The two are different controls, not the same control with the ring removed.
 */
export function ThemeSelect() {
  const { chrome, locale, setTheme, theme, themes } = usePayload();

  if (themes.length < 2) {
    return null;
  }

  const label = t(locale, 'theme.select');

  const menu = (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={label}
        title={label}
        className={controlChrome({ chrome })}
      >
        <PaletteIcon className={controlIcon({ chrome })} />
        <span className="sr-only">{label}</span>
      </DropdownMenuTrigger>
      {/*
        Sized to its own content, not the trigger. The shadcn default pins a
        menu to `--radix-dropdown-menu-trigger-width`, which suits a combobox
        but not this icon button — it collapsed every menu to the
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

  if (chrome !== 'flat' || themes.length > segmentLimit) {
    return menu;
  }

  return (
    <>
      {/* Theme names are words, and three of them plus the scheme segments and
          the menu trigger do not fit a phone. Only one of the pair is ever in
          the accessibility tree, since the other is display:none. */}
      <ToggleGroup
        type="single"
        value={theme}
        // Radix clears the value when the active item is pressed again; a
        // theme cannot be unset, so an empty result keeps the current one
        onValueChange={(next) => next && setTheme(next)}
        spacing={0}
        size="sm"
        aria-label={label}
        className={segmentTrack({ className: 'max-md:hidden' })}
      >
        {themes.map(({ value, label }) => (
          <ToggleGroupItem key={value} value={value} className={segment()}>
            {label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <span className="md:hidden">{menu}</span>
    </>
  );
}
