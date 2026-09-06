'use client';

import type {
  TranslationsKeys,
  TranslationsObject
} from '@codeware/app-cms/util/i18n';
import { Button } from '@codeware/shared/ui/shadcn/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger
} from '@codeware/shared/ui/shadcn/components/dropdown-menu';
import { ChevronDownIcon, GlobeAltIcon } from '@heroicons/react/24/outline';
import { getTranslation } from '@payloadcms/translations';
import {
  useConfig,
  useLocale,
  useRouteTransition,
  useTranslation
} from '@payloadcms/ui';
import { useRouter } from 'next/navigation';
import React from 'react';

/**
 * Content-locale select for Payload's toolbar (`admin.components.actions`).
 *
 * Replaces Payload's built-in Localizer (hidden in `custom.css`), which only
 * showed a bare language name and was easily mistaken for the UI-language
 * picker. The pill is explicitly labeled with the current locale and expands
 * to the locales available to the tenant (`filterAvailableLocales` already
 * shapes the client config). Hidden entirely for single-locale tenants.
 *
 * Switching mirrors the built-in behavior: swap the `locale` query param on
 * the current URL — every admin view derives its content locale from it.
 */
export function LocaleSwitch() {
  const { config } = useConfig();
  const locale = useLocale();
  const router = useRouter();
  const { startRouteTransition } = useRouteTransition();
  const { i18n, t } = useTranslation<TranslationsObject, TranslationsKeys>();

  const locales = config.localization ? config.localization.locales : [];

  // Single-locale tenants have nothing to switch.
  if (!locale || locales.length < 2) {
    return null;
  }

  // Payload `useLocale` type bug workaround:
  // the hook's own JSDoc tells the real runtime is `false | {} | Locale`.
  // So on first client render `locale` can be `{}` — truthy, but with no `code`.
  if (!locale?.code) {
    return null;
  }

  const changeLocale = (code: string) => {
    if (code === locale.code) return;
    // Keep all other query params (list filters, search) verbatim
    const params = new URLSearchParams(window.location.search);
    params.set('locale', code);
    startRouteTransition(() =>
      router.push(`${window.location.pathname}?${params.toString()}`)
    );
  };

  return (
    <div className="codeware-admin twp">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="toolbar"
            size="sm"
            title={t('nav:contentLocaleAria')}
          >
            <GlobeAltIcon className="size-3.5" aria-hidden />
            {/* Collapses to just the code on narrow viewports, like the
             * language pill — the full `Locale: EN` label is what kept this
             * action from shrinking with the rest of the toolbar. */}
            <span className="max-lg:hidden">{t('nav:contentLocale')}:</span>
            <span>{locale.code.toUpperCase()}</span>
            <ChevronDownIcon className="size-3" aria-hidden />
            <span className="sr-only">{t('nav:contentLocaleAria')}</span>
          </Button>
        </DropdownMenuTrigger>
        {/* Portal content — re-apply the admin scope so shadcn tokens resolve */}
        <DropdownMenuContent align="end" className="codeware-admin twp">
          <DropdownMenuRadioGroup
            value={locale.code}
            onValueChange={changeLocale}
          >
            {locales.map((option) => (
              <DropdownMenuRadioItem key={option.code} value={option.code}>
                {getTranslation(option.label, i18n)}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export default LocaleSwitch;
