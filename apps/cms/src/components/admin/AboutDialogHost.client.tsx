'use client';

import type {
  TranslationsKeys,
  TranslationsObject
} from '@codeware/app-cms/util/i18n';
import { AppAbout, type AppInfo } from '@codeware/shared/ui/cms-renderer';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@codeware/shared/ui/shadcn/components/dialog';
import { useTranslation } from '@payloadcms/ui';
import { useEffect, useState } from 'react';

/**
 * Custom event that opens the About dialog from anywhere in the admin,
 * e.g. the command palette quick action.
 */
export const OPEN_ABOUT_EVENT = 'cdwr:open-about';

/**
 * Client host for the admin About dialog. Mounted (invisibly) via a server
 * action component that supplies the app's build metadata; opened on
 * {@link OPEN_ABOUT_EVENT}, dispatched by the command palette.
 */
export function AboutDialogHost({ appInfo }: { appInfo: AppInfo }) {
  const { i18n, t } = useTranslation<TranslationsObject, TranslationsKeys>();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener(OPEN_ABOUT_EVENT, handler);
    return () => window.removeEventListener(OPEN_ABOUT_EVENT, handler);
  }, []);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="codeware-admin twp gap-5 p-6 sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('palette:aboutTitle')}</DialogTitle>
          <DialogDescription>{t('palette:aboutDescription')}</DialogDescription>
        </DialogHeader>
        <AppAbout appInfo={appInfo} locale={i18n.language} />
      </DialogContent>
    </Dialog>
  );
}

export default AboutDialogHost;
