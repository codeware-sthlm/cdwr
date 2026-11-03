'use client';

import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle
} from '@codeware/shared/ui/shadcn/components/drawer';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle
} from '@codeware/shared/ui/shadcn/components/sheet';
import { useIsMobile } from '@codeware/shared/ui/shadcn/hooks/use-mobile';
import type {
  FormBlock as FormBlockProps,
  Form as FormType
} from '@codeware/shared/util/payload-types';
import { useCallback, useEffect, useState } from 'react';

import { useAnchorTarget } from '../../providers/anchor-targets';
import { RichText } from '../RichText';

import { PopulatedFormBlock } from './FormBlock';
import { FormConfirmationDialog } from './FormConfirmationDialog';
// The inner block, not `FormBlock`: that one would see the overlay setting
// again and draw this component inside itself

type Props = {
  form: FormType;
  anchor: string;
  title: string;
  enableIntro?: FormBlockProps['enableIntro'];
  introContent?: FormBlockProps['introContent'];
  disabled?: boolean;
};

/**
 * A form kept out of the page until a link to its anchor opens it: a panel
 * beside the page on a wide screen, a sheet from the bottom on a phone.
 * Draws nothing in the page flow.
 */
export const FormOverlay: React.FC<Props> = ({
  anchor,
  disabled,
  enableIntro,
  form,
  introContent,
  title
}) => {
  const [open, setOpen] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const isMobile = useIsMobile();

  useAnchorTarget(anchor, () => setOpen(true));

  // A plain `<a href="#anchor">` in rich text sets the hash natively, and a
  // visitor may arrive on the page with it already there
  useEffect(() => {
    const check = () => {
      if (window.location.hash === `#${anchor}`) {
        setOpen(true);
      }
    };
    check();
    window.addEventListener('hashchange', check);
    return () => window.removeEventListener('hashchange', check);
  }, [anchor]);

  const onOpenChange = useCallback(
    (next: boolean) => {
      setOpen(next);
      // Clear the hash so the same link opens the overlay again
      if (!next && window.location.hash === `#${anchor}`) {
        history.replaceState(
          null,
          '',
          window.location.pathname + window.location.search
        );
      }
    },
    [anchor]
  );

  const intro = enableIntro && introContent && (
    <RichText className="mb-6" data={introContent} />
  );

  const body = (
    <PopulatedFormBlock
      blockType="form"
      form={form}
      unframed
      disabled={disabled}
      onSuccess={() => {
        onOpenChange(false);
        if (form.confirmationType === 'message') {
          setConfirmed(true);
        }
      }}
    />
  );

  return (
    <>
      {isMobile ? (
        <Drawer open={open} onOpenChange={onOpenChange}>
          <DrawerContent>
            <DrawerHeader>
              <DrawerTitle>{title}</DrawerTitle>
              <DrawerDescription className="sr-only">
                {form.title}
              </DrawerDescription>
            </DrawerHeader>
            <div className="overflow-y-auto px-4 pb-6">
              {intro}
              {body}
            </div>
          </DrawerContent>
        </Drawer>
      ) : (
        <Sheet open={open} onOpenChange={onOpenChange}>
          <SheetContent side="right" size="md" className="overflow-y-auto">
            <SheetHeader className="p-6">
              <SheetTitle className="text-xl font-semibold">{title}</SheetTitle>
              {/* A paragraph, so the intro cannot sit inside it */}
              <SheetDescription className="sr-only">
                {form.title}
              </SheetDescription>
            </SheetHeader>
            <div className="px-6 pb-8">
              {intro}
              {body}
            </div>
          </SheetContent>
        </Sheet>
      )}
      {/* Outside the sheet, so it survives the close */}
      <FormConfirmationDialog
        open={confirmed}
        onOpenChange={setConfirmed}
        message={form.confirmationMessage}
      />
    </>
  );
};
