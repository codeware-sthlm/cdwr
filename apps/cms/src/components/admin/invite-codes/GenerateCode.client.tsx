'use client';

import type {
  TranslationsKeys,
  TranslationsObject
} from '@codeware/app-cms/util/i18n';
import { CopyButton } from '@codeware/shared/ui/copy-button';
import { Button } from '@codeware/shared/ui/shadcn/components/button';
import { useField, useTranslation } from '@payloadcms/ui';
import React from 'react';

import { generateInviteCode } from './generate-invite-code';

/**
 * Fills the `code` field with a generated invite code and shows it to copy.
 *
 * Only on create: once saved just a hash is kept, so this is the one place
 * the code can be read.
 */
export const GenerateCode: React.FC = () => {
  const { t } = useTranslation<TranslationsObject, TranslationsKeys>();
  const { value, setValue } = useField<string>({ path: 'code' });

  return (
    <div className="codeware-admin twp mb-6 flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => setValue(generateInviteCode())}
        >
          {t(value ? 'inviteCodes:regenerate' : 'inviteCodes:generate')}
        </Button>
      </div>
      {value && (
        <>
          <div className="border-border bg-muted relative rounded-lg border py-3 pr-12 pl-3 font-mono text-lg tracking-wider">
            {value}
            <CopyButton code={value} label={t('inviteCodes:codeCopy')} />
          </div>
          <p className="text-muted-foreground text-sm">
            {t('inviteCodes:codeHint')}
          </p>
        </>
      )}
    </div>
  );
};
