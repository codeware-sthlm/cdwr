'use client';

import type {
  TranslationsKeys,
  TranslationsObject
} from '@codeware/app-cms/util/i18n';
import { Button } from '@codeware/shared/ui/shadcn/components/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@codeware/shared/ui/shadcn/components/dialog';
import {
  toast,
  useConfig,
  useDocumentInfo,
  useTranslation
} from '@payloadcms/ui';
import React, { useState } from 'react';

/**
 * Ends every trusted device of a user, so each asks for the two-factor code
 * again at the next sign-in.
 *
 * The endpoint decides who may do it; the field's condition only keeps the
 * button from people it would refuse.
 */
export const TotpTrustForget: React.FC = () => {
  const { t } = useTranslation<TranslationsObject, TranslationsKeys>();
  const { config } = useConfig();
  const { id } = useDocumentInfo();

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const forget = async () => {
    setBusy(true);
    try {
      const res = await fetch(
        `${config.routes.api}/users/${id}/totp-trust-forget`,
        { method: 'POST', credentials: 'include' }
      );
      if (!res.ok) {
        throw new Error(res.statusText);
      }
      toast.success(t('totpTrustForget:done'));
      setOpen(false);
    } catch {
      toast.error(t('totpTrustForget:error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="codeware-admin twp mb-6 flex flex-col items-start gap-2">
      {/* Held open while it runs, so closing it never reads as a cancel */}
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!busy) {
            setOpen(next);
          }
        }}
      >
        <DialogTrigger asChild>
          <Button type="button" variant="outline">
            {t('totpTrustForget:button')}
          </Button>
        </DialogTrigger>
        <DialogContent className="codeware-admin twp">
          <DialogHeader>
            <DialogTitle>{t('totpTrustForget:button')}</DialogTitle>
            <DialogDescription>
              {t('totpTrustForget:confirmMessage')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={busy}>
                {t('general:cancel')}
              </Button>
            </DialogClose>
            <Button
              type="button"
              variant="destructive"
              disabled={busy}
              onClick={() => void forget()}
            >
              {t('totpTrustForget:confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <p className="text-muted-foreground text-sm">
        {t('totpTrustForget:description')}
      </p>
    </div>
  );
};

export default TotpTrustForget;
