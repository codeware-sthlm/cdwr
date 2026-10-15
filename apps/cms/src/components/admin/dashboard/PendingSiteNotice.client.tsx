'use client';

import { PendingSiteCard } from '@codeware/app-cms/ui/dashboard';
import type {
  TranslationsKeys,
  TranslationsObject
} from '@codeware/app-cms/util/i18n';
import { useTranslation } from '@payloadcms/ui';

/** Translated pending-site card for the Home tab. */
export function PendingSiteNotice() {
  const { t } = useTranslation<TranslationsObject, TranslationsKeys>();

  return (
    <PendingSiteCard
      title={t('dashboard:pendingSiteTitle')}
      points={[
        {
          label: t('dashboard:pendingSiteNowLabel'),
          text: t('dashboard:pendingSiteNow')
        },
        {
          label: t('dashboard:pendingSiteNextLabel'),
          text: t('dashboard:pendingSiteNext')
        },
        {
          label: t('dashboard:pendingSiteMeanwhileLabel'),
          text: t('dashboard:pendingSiteMeanwhile')
        }
      ]}
    />
  );
}
