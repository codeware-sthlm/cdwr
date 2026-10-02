'use client';

import type {
  TranslationsKeys,
  TranslationsObject
} from '@codeware/app-cms/util/i18n';
import { Badge } from '@codeware/shared/ui/shadcn/components/badge';
import { cn } from '@codeware/shared/util/ui';
import {
  useConfig,
  useDocumentInfo,
  useFormFields,
  useTranslation
} from '@payloadcms/ui';
import type { UIFieldClientComponent } from 'payload';
import React, { useEffect, useMemo, useState } from 'react';

import {
  type BuildState,
  POLL_INTERVAL_MS,
  POLL_TIMEOUT_MS,
  type BuildStatus as Status,
  formatPosition,
  isServingPrevious,
  parseBuild,
  shouldPoll,
  sortDiagnostics
} from './build-status';
import { readBuild } from './read-build';

const statusLabels = {
  pending: 'customComponents:statusPending',
  building: 'customComponents:statusBuilding',
  ready: 'customComponents:statusReady',
  failed: 'customComponents:statusFailed'
} as const satisfies Record<Status, TranslationsKeys>;

const statusVariants = {
  pending: 'muted',
  building: 'muted',
  ready: 'success',
  failed: 'destructive'
} as const satisfies Record<
  Status,
  React.ComponentProps<typeof Badge>['variant']
>;

type PanelProps = {
  apiRoute: string;
  collectionSlug: string;
  id: number | string;
  /** The build as the form holds it */
  form: BuildState | null;
};

const BuildPanel: React.FC<PanelProps> = ({
  apiRoute,
  collectionSlug,
  id,
  form
}) => {
  const { t, i18n } = useTranslation<TranslationsObject, TranslationsKeys>();
  const [polled, setPolled] = useState<BuildState | null>(null);
  const [gaveUp, setGaveUp] = useState(false);

  const formStatus = form?.status;

  // Reads the stored build once whatever the form says, since the form only
  // knows the status as it was when the page loaded or the save returned, then
  // keeps reading until the build settles. A save remounts the panel, which
  // starts the loop again.
  useEffect(() => {
    const controller = new AbortController();
    const deadline = Date.now() + POLL_TIMEOUT_MS;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = async () => {
      const next = await readBuild({
        apiRoute,
        collectionSlug,
        id,
        signal: controller.signal
      });
      if (controller.signal.aborted) {
        return;
      }
      if (next) {
        setPolled(next);
        if (!shouldPoll(next.status)) {
          return;
        }
      }
      if (Date.now() >= deadline) {
        setGaveUp(true);
        return;
      }
      timer = setTimeout(() => void tick(), POLL_INTERVAL_MS);
    };

    void tick();

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [apiRoute, collectionSlug, id, formStatus]);

  const build = polled ?? form;
  if (!build) {
    return null;
  }

  const diagnostics = sortDiagnostics(build.diagnostics);
  const builtAt = build.builtAt
    ? new Date(build.builtAt).toLocaleString(i18n.language)
    : null;

  return (
    <div className="twp flex flex-col gap-2 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={statusVariants[build.status]}>
          {t(statusLabels[build.status])}
        </Badge>
        {build.status === 'ready' && builtAt && (
          <span className="text-muted-foreground">
            {t('customComponents:builtAt', { time: builtAt })}
          </span>
        )}
        {build.hash && (
          <code className="text-muted-foreground">
            {build.hash.slice(0, 8)}
          </code>
        )}
      </div>

      {shouldPoll(build.status) && gaveUp && (
        <p className="text-muted-foreground">
          {t('customComponents:stillBuilding')}
        </p>
      )}

      {isServingPrevious(build) && (
        <p className="text-muted-foreground">
          {t('customComponents:servingPrevious')}
        </p>
      )}

      {build.status === 'failed' && diagnostics.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-1 p-0 font-mono">
          {diagnostics.map((diagnostic, index) => (
            <li
              key={`${diagnostic.line}:${diagnostic.column}:${index}`}
              className={cn(
                'whitespace-pre-wrap',
                diagnostic.severity === 'error'
                  ? 'text-destructive'
                  : 'text-(--warning-subtle)'
              )}
            >
              {formatPosition(diagnostic)}
              {'  '}
              {diagnostic.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

/**
 * The build result of a custom component: status, built time and, when the
 * build failed, its diagnostics. Follows a build that is still running by
 * polling the document until it settles.
 */
const BuildStatus: UIFieldClientComponent = () => {
  const { t } = useTranslation<TranslationsObject, TranslationsKeys>();
  const { config } = useConfig();
  const { id, collectionSlug, lastUpdateTime } = useDocumentInfo();

  const status = useFormFields(([fields]) => fields['build.status']?.value);
  const hash = useFormFields(([fields]) => fields['build.hash']?.value);
  const builtAt = useFormFields(([fields]) => fields['build.builtAt']?.value);
  const diagnostics = useFormFields(
    ([fields]) => fields['build.diagnostics']?.value
  );

  const form = useMemo(
    () => parseBuild({ status, hash, builtAt, diagnostics }),
    [status, hash, builtAt, diagnostics]
  );

  if (!id || !collectionSlug) {
    return (
      <p className="twp text-muted-foreground text-sm">
        {t('customComponents:builtOnSave')}
      </p>
    );
  }

  return (
    <BuildPanel
      key={`${id}:${lastUpdateTime}`}
      // Relative: the admin and its api are one app, whatever host serves it
      apiRoute={config.routes.api}
      collectionSlug={collectionSlug}
      id={id}
      form={form}
    />
  );
};

export default BuildStatus;
