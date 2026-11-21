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
  useFormFields,
  useTranslation
} from '@payloadcms/ui';
import React, { useState } from 'react';

/**
 * Clears a user's two-factor setup, for someone who lost their authenticator.
 *
 * The endpoint decides who may do it; the field's condition only keeps the
 * button from people it would refuse.
 */
export const TotpReset: React.FC = () => {
  const { t } = useTranslation<TranslationsObject, TranslationsKeys>();
  const { config } = useConfig();
  const { id } = useDocumentInfo();
  const name = useFormFields(([fields]) => fields.name?.value);
  const email = useFormFields(([fields]) => fields.email?.value);
  const who = String(name || email || '');

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const reset = async () => {
    setBusy(true);
    try {
      const res = await fetch(`${config.routes.api}/users/${id}/totp-reset`, {
        method: 'POST',
        credentials: 'include'
      });
      if (!res.ok) {
        throw new Error(res.statusText);
      }
      toast.success(t('totpReset:done', { name: who }));
      setOpen(false);
    } catch {
      toast.error(t('totpReset:failed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="codeware-admin twp mb-6">
      {/* Held open while the reset runs, so closing it never reads as a cancel */}
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!busy) {
            setOpen(next);
          }
        }}
      >
        {/* The trigger is where focus returns when the dialog closes */}
        <DialogTrigger asChild>
          <Button type="button" variant="outline">
            {t('totpReset:button')}
          </Button>
        </DialogTrigger>
        <DialogContent className="codeware-admin twp">
          <DialogHeader>
            <DialogTitle>{t('totpReset:title')}</DialogTitle>
            <DialogDescription>
              {t('totpReset:description', { name: who })}
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
              onClick={() => void reset()}
            >
              {t('totpReset:confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TotpReset;
