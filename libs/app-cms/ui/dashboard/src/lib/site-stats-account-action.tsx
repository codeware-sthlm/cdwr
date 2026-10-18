'use client';

import { Button } from '@codeware/shared/ui/shadcn/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@codeware/shared/ui/shadcn/components/dialog';
import { useState } from 'react';

export type SiteStatsAccountActionProps = {
  /** Which action the caller has: a first login, or a new password */
  account: 'available' | 'ready';
  /** Sends the login; rejects when it could not be sent, keeping the dialog open */
  onConfirm: () => Promise<void>;
  labels: {
    get: string;
    getBody: string;
    reset: string;
    resetBody: string;
    cancel: string;
    confirm: string;
  };
};

/**
 * The sheet header's button for a Umami login, with a small dialog that says
 * the login is mailed to the caller's address before anything is sent.
 */
export function SiteStatsAccountAction({
  account,
  onConfirm,
  labels
}: SiteStatsAccountActionProps) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const title = account === 'available' ? labels.get : labels.reset;
  const body = account === 'available' ? labels.getBody : labels.resetBody;

  const confirm = async () => {
    setBusy(true);
    try {
      await onConfirm();
      setOpen(false);
    } catch {
      // The caller has told the user; the dialog stays for another try
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && setOpen(next)}>
      <DialogTrigger asChild>
        <Button variant="secondary" size="sm" className="w-fit">
          {title}
        </Button>
      </DialogTrigger>
      <DialogContent className="codeware-admin twp">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{body}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => setOpen(false)}
          >
            {labels.cancel}
          </Button>
          <Button disabled={busy} onClick={() => void confirm()}>
            {labels.confirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
