'use client';

import { StatusWidget } from '@codeware/app-cms/ui/dashboard';
import {
  CodeNames,
  type InfisicalRowState,
  type InfisicalStatus,
  InfisicalStatusRow,
  byWorstInfisicalState,
  summarizeInfisicalStatus,
  toInfisicalStatusItems
} from '@codeware/app-cms/ui/provisioning';
import type {
  TranslationsKeys,
  TranslationsObject
} from '@codeware/app-cms/util/i18n';
import { Button } from '@codeware/shared/ui/shadcn/components/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle
} from '@codeware/shared/ui/shadcn/components/sheet';
import { KeyIcon } from '@heroicons/react/24/outline';
import { useDocumentInfo, useTranslation } from '@payloadcms/ui';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';

import { formatRelativeTime } from '../utils/relative-time';
import { usePayloadSdk } from '../utils/use-payload-sdk';

type Outcome = { status: InfisicalStatus } | { error: string };

const STATE_KEYS = {
  'key-mismatch': 'provisioning:stateKeyMismatch',
  'missing-key': 'provisioning:stateMissingKey',
  'missing-folder': 'provisioning:stateMissingFolder',
  'no-rules': 'provisioning:stateNoRules',
  unreadable: 'provisioning:stateUnreadable',
  ready: 'provisioning:stateReady',
  'not-provisioned': 'provisioning:stateNotProvisioned',
  'not-deployed': 'provisioning:stateNotDeployed'
} as const satisfies Record<InfisicalRowState, TranslationsKeys>;

const DETAIL_KEYS = {
  'key-mismatch': 'provisioning:detailKeyMismatch',
  'missing-key': 'provisioning:detailMissingKey',
  'missing-folder': 'provisioning:detailMissingFolder',
  'no-rules': 'provisioning:detailNoRules',
  unreadable: 'provisioning:detailUnreadable',
  ready: 'provisioning:detailReady',
  'not-provisioned': 'provisioning:detailNotProvisioned',
  'not-deployed': 'provisioning:detailNotDeployed'
} as const satisfies Record<InfisicalRowState, TranslationsKeys>;

/**
 * What Infisical holds for this workspace, as a status widget and a sheet.
 *
 * Reads the saved deployment name rather than the form's, since the endpoint
 * reads the stored workspace too — an unsaved name has nothing to show yet.
 * Read once when the workspace opens, and again only when asked.
 */
export const InfisicalPanel: React.FC<{ language: string }> = ({
  language
}) => {
  const { t } = useTranslation<TranslationsObject, TranslationsKeys>();
  const { id, data } = useDocumentInfo();
  const { sdk } = usePayloadSdk();

  const deployment =
    (data as { deployment?: string | null } | undefined)?.deployment ?? null;

  const [status, setStatus] = useState<InfisicalStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  // Only the latest read may land: a slower earlier answer would otherwise
  // replace a newer one
  const sequence = useRef(0);

  /** One read, answered as data so state is only set once it is in */
  const request = useCallback(
    async (refresh: boolean): Promise<Outcome> => {
      try {
        const response = await sdk.request({
          method: 'POST',
          path: '/tenant-infisical-status',
          json: { tenant: id, refresh }
        });
        const body = (await response.json()) as InfisicalStatus & {
          error?: string;
        };

        return response.ok
          ? { status: body }
          : { error: body.error || t('provisioning:checkFailed') };
      } catch {
        return { error: t('provisioning:checkFailed') };
      }
    },
    [id, sdk, t]
  );

  const apply = useCallback((outcome: Outcome) => {
    if ('status' in outcome) {
      setStatus(outcome.status);
      setError(null);
    } else {
      setError(outcome.error);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!id || !deployment) {
      return;
    }

    // A read that returns after the workspace changed must not land
    let cancelled = false;
    const seq = ++sequence.current;

    void request(false).then((outcome) => {
      if (!cancelled && seq === sequence.current) {
        apply(outcome);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [apply, deployment, id, request]);

  const checkAgain = () => {
    const seq = ++sequence.current;

    setLoading(true);
    setError(null);
    void request(true).then((outcome) => {
      if (seq === sequence.current) {
        apply(outcome);
      }
    });
  };

  // Nothing answered yet counts as busy too, which covers the first read
  const busy = loading || (!status && !error);

  const items = useMemo(
    () =>
      status ? toInfisicalStatusItems(status).sort(byWorstInfisicalState) : [],
    [status]
  );
  const verdict = summarizeInfisicalStatus(items);

  const rowLabels = {
    states: Object.fromEntries(
      Object.entries(STATE_KEYS).map(([state, key]) => [state, t(key)])
    ) as Record<InfisicalRowState, string>,
    environments: {
      production: t('provisioning:production'),
      preview: t('provisioning:preview')
    },
    optionalKeys: (keys: string) => t('provisioning:optionalKeys', { keys })
  };

  // Nothing answered yet reads as checking, including right after a save
  const detail = busy
    ? t('provisioning:checking')
    : (error ??
      (status ? t(DETAIL_KEYS[verdict.state], { count: verdict.count }) : ''));

  return (
    // A custom ui field brings no spacing of its own, like the domains panel
    <div className="codeware-admin twp mt-2 mb-6 flex flex-col gap-3">
      <h4 className="flex items-center gap-2 text-sm font-medium">
        <KeyIcon className="size-4" />
        {t('provisioning:title')}
      </h4>

      {!deployment ? (
        <p className="text-muted-foreground text-sm">
          {t('provisioning:noDeployment')}
        </p>
      ) : (
        <>
          <div className="max-w-md">
            <StatusWidget
              icon={KeyIcon}
              tone={error ? 'error' : status ? verdict.tone : 'neutral'}
              title={t('provisioning:title')}
              metric={deployment}
              detail={<CodeNames text={detail} />}
              openLabel={t('provisioning:open')}
              onOpen={status && !loading ? () => setOpen(true) : undefined}
            />
          </div>
          <div className="text-muted-foreground flex items-center gap-3 text-xs">
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={checkAgain}
            >
              {t('provisioning:checkAgain')}
            </Button>
            {status && formatRelativeTime(status.checkedAt, language)}
          </div>
        </>
      )}

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent size="lg" className="codeware-admin twp gap-0">
          <SheetHeader>
            <SheetTitle>{t('provisioning:title')}</SheetTitle>
            <SheetDescription>
              <CodeNames text={t('provisioning:sheetSub')} />
            </SheetDescription>
          </SheetHeader>
          <div className="flex flex-col gap-0.5 overflow-y-auto px-2 pb-4">
            {items.map((item) => (
              <InfisicalStatusRow
                key={`${item.environment}|${item.app ?? ''}`}
                item={item}
                labels={rowLabels}
              />
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
};
