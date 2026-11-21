'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@codeware/shared/ui/shadcn/components/dialog';
import { t } from '@codeware/shared/util/i18n';
import type { Form as FormType } from '@codeware/shared/util/payload-types';

import { usePayload } from '../../providers/PayloadProvider';
import { RichText } from '../RichText';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The form's `confirmationMessage` */
  message: FormType['confirmationMessage'];
};

/** Tells the visitor a form was accepted, with the form's own message */
export const FormConfirmationDialog: React.FC<Props> = ({
  message,
  onOpenChange,
  open
}) => {
  const { locale } = usePayload();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t(locale, 'form.submitSuccess')}</DialogTitle>
          <DialogDescription />
        </DialogHeader>
        {message && <RichText data={message} />}
      </DialogContent>
    </Dialog>
  );
};
