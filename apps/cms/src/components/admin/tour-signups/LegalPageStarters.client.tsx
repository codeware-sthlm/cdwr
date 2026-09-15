'use client';

import type {
  TranslationsKeys,
  TranslationsObject
} from '@codeware/app-cms/util/i18n';
import { Button } from '@codeware/shared/ui/shadcn/components/button';
import { DocumentPlusIcon } from '@heroicons/react/24/outline';
import { useField, useTranslation } from '@payloadcms/ui';
import React, { useCallback, useState } from 'react';

import { usePayloadSdk } from '../utils/use-payload-sdk';

type Kind = 'privacy' | 'terms';

const paths: Record<Kind, string> = {
  privacy: 'legal.privacyPage',
  terms: 'legal.termsPage'
};

/**
 * Offers a starter privacy or terms page when the workspace has none.
 *
 * The button creates a **draft** page from the platform's template and points
 * the field above at it — it does not save the settings. The editor sees the
 * relationship fill in and presses Save themselves, which keeps a legal page
 * from being wired up by a click they might not have understood.
 *
 * Once a page is selected the offer disappears; replacing it is a matter of
 * picking a different page, not generating another draft.
 */
export const LegalPageStarters: React.FC = () => {
  const { t } = useTranslation<TranslationsObject, TranslationsKeys>();
  const { sdk } = usePayloadSdk();

  const privacy = useField<number>({ path: paths.privacy });
  const terms = useField<number>({ path: paths.terms });

  const [busy, setBusy] = useState<Kind | null>(null);
  const [error, setError] = useState<string | null>(null);

  const create = useCallback(
    async (kind: Kind) => {
      setBusy(kind);
      setError(null);
      try {
        const response = await sdk.request({
          method: 'POST',
          path: '/create-legal-page',
          json: { kind }
        });

        if (!response.ok) {
          setError(t('tourSignups:starterFailed'));
          return;
        }

        const page = (await response.json()) as { id: number };
        (kind === 'privacy' ? privacy : terms).setValue(page.id);
      } catch {
        setError(t('tourSignups:starterFailed'));
      } finally {
        setBusy(null);
      }
    },
    [privacy, sdk, t, terms]
  );

  const offers: Array<Kind> = [
    ...(privacy.value ? [] : (['privacy'] as const)),
    ...(terms.value ? [] : (['terms'] as const))
  ];

  if (!offers.length) {
    return null;
  }

  return (
    // Payload's own fields carry their spacing in the admin stylesheet; a
    // custom ui field brings none, so it has to reserve its own room
    <div className="codeware-admin twp mt-2 mb-6 flex flex-col gap-3">
      <p className="text-muted-foreground text-sm">
        {t('tourSignups:starterLede')}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {offers.map((kind) => (
          <Button
            key={kind}
            variant="outline"
            size="sm"
            disabled={busy !== null}
            onClick={() => void create(kind)}
          >
            <DocumentPlusIcon className="size-4" />
            {kind === 'privacy'
              ? t('tourSignups:starterPrivacy')
              : t('tourSignups:starterTerms')}
          </Button>
        ))}
      </div>
      {error && (
        <p role="alert" className="text-sm text-(--destructive-subtle)">
          {error}
        </p>
      )}
    </div>
  );
};

export default LegalPageStarters;
