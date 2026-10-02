import {
  type StudioBuild,
  shouldPoll
} from '@codeware/shared/ui/component-studio';
import { useConfig, useDocumentInfo, useFormFields } from '@payloadcms/ui';
import { useEffect, useMemo, useState } from 'react';

import { POLL_INTERVAL_MS, POLL_TIMEOUT_MS, parseBuild } from './build-status';
import { readBuild } from './read-build';

type Polled = { key: string; build: StudioBuild };

/**
 * The build the document is stored with.
 *
 * The form only knows the status as it was when the page loaded or the last
 * save returned, so the stored build is read once on mount and after each
 * save, then again until it settles. Null before the document exists.
 */
export const useStoredBuild = (): StudioBuild | null => {
  const { config } = useConfig();
  const { id, collectionSlug, lastUpdateTime } = useDocumentInfo();
  // Relative: the admin and its api are one app, whatever host serves it
  const apiRoute = config.routes.api;

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

  const formStatus = form?.status;
  const key =
    id && collectionSlug
      ? `${collectionSlug}:${id}:${lastUpdateTime}:${formStatus}`
      : null;
  const [polled, setPolled] = useState<Polled | null>(null);

  useEffect(() => {
    if (!id || !collectionSlug || key === null) {
      return;
    }
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
        setPolled({ key, build: next });
        if (!shouldPoll(next.status)) {
          return;
        }
      }
      if (Date.now() >= deadline) {
        return;
      }
      timer = setTimeout(() => void tick(), POLL_INTERVAL_MS);
    };

    void tick();

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [apiRoute, collectionSlug, id, key]);

  if (key === null) {
    return null;
  }
  // An answer for an earlier save says nothing about this one
  return polled?.key === key ? polled.build : form;
};
