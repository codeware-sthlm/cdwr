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
import { ChevronDownIcon, LanguageIcon } from '@heroicons/react/24/outline';
import type { AcceptedLanguages } from '@payloadcms/translations';
import { useTranslation } from '@payloadcms/ui';
import React from 'react';

/**
 * Admin UI language select for Payload's toolbar (`admin.components.actions`).
 *
 * A pill trigger showing the current interface language that expands to the
 * supported languages. Distinct from the content-locale select
 * (`LocaleSwitch`), which changes the language of the *content* being edited.
 * Persistence is handled by Payload's own `switchLanguage` server action.
 */
export function LanguageSwitch() {
  const { i18n, languageOptions, switchLanguage, t } = useTranslation<
    TranslationsObject,
    TranslationsKeys
  >();

  // Nothing to switch without the server action or a second language
  if (!switchLanguage || languageOptions.length < 2) {
    return null;
  }

  const changeLanguage = (value: string) => {
    if (value === i18n.language) {
      return;
    }
    void switchLanguage(value as AcceptedLanguages);
  };

  return (
    <div className="codeware-admin twp">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="toolbar"
            size="sm"
            title={t('nav:interfaceLanguage')}
          >
            <LanguageIcon className="size-3.5" aria-hidden />
            {i18n.language.toUpperCase()}
            <ChevronDownIcon className="size-3" aria-hidden />
            <span className="sr-only">{t('nav:interfaceLanguage')}</span>
          </Button>
        </DropdownMenuTrigger>
        {/* Portal content — re-apply the admin scope so shadcn tokens resolve */}
        <DropdownMenuContent align="end" className="codeware-admin twp">
          <DropdownMenuRadioGroup
            value={i18n.language}
            onValueChange={changeLanguage}
          >
            {languageOptions.map(({ label, value }) => (
              <DropdownMenuRadioItem key={value} value={value}>
                {label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export default LanguageSwitch;
