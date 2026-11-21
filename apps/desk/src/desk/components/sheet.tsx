import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerTitle
} from '@codeware/shared/ui/shadcn/components/drawer';
import {
  SheetContent,
  SheetDescription,
  Sheet as SheetShell,
  SheetTitle
} from '@codeware/shared/ui/shadcn/components/sheet';
import { type ReactNode, useRef, useSyncExternalStore } from 'react';

/** The desk's phone breakpoint, the same as desk.css; shadcn's `useIsMobile` breaks at 768 px */
export const PHONE = '(max-width: 600px)';

/** Whether a media query matches, kept current as it changes */
export const useMedia = (query: string): boolean =>
  useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    () => window.matchMedia(query).matches,
    () => false
  );

type Props = {
  open: boolean;
  title: string;
  sub: string;
  /** Focus the Close button on open; false for a sheet opened by a start hash */
  focus: boolean;
  /** The overlay, Escape, Close, or a drag down on the phone */
  onClose: () => void;
  /** Once closed: puts focus back on what opened the sheet */
  onClosed: () => void;
  children?: ReactNode;
};

/**
 * The frame every sheet opens in: a side sheet from the right, or on the phone a full-screen
 * drawer that drags down to close. The head and body are drawn with utilities here.
 */
export const Sheet = ({
  open,
  title,
  sub,
  focus,
  onClose,
  onClosed,
  children
}: Props) => {
  const phone = useMedia(PHONE);
  const close = useRef<HTMLButtonElement>(null);
  const onOpenChange = (next: boolean) => {
    if (!next) onClose();
  };
  const onOpenAutoFocus = (e: Event) => {
    e.preventDefault();
    if (focus) close.current?.focus();
  };
  // The sheets open from the desk's tiles, not from a Radix trigger, so Radix has nothing to
  // return focus to
  const onCloseAutoFocus = (e: Event) => {
    e.preventDefault();
    onClosed();
  };
  const Title = phone ? DrawerTitle : SheetTitle;
  const Sub = phone ? DrawerDescription : SheetDescription;
  // The title and description take their utilities as props, so they are merged over the shadcn ones
  const parts = (
    <>
      <div className="flex items-start justify-between gap-3 border-b border-[color:var(--line)] px-6 pt-[22px] pb-4 max-[600px]:px-5 max-[600px]:pt-2 max-[600px]:pb-3.5">
        <div>
          <Title asChild>
            <h2>{title}</h2>
          </Title>
          <Sub asChild className="mt-0.5 font-[family-name:var(--font-mono)]">
            <p>{sub}</p>
          </Sub>
        </div>
        <button
          type="button"
          id="sheet-close"
          className="min-h-[var(--tap)] min-w-[var(--tap)] flex-none"
          ref={close}
          onClick={onClose}
        >
          Close
        </button>
      </div>
      <div
        className="sheet-body flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-6 pt-[18px] pb-[calc(18px_+_env(safe-area-inset-bottom,0px))] max-[600px]:gap-2.5 max-[600px]:px-4 max-[600px]:pt-3.5 max-[600px]:pb-[calc(14px_+_env(safe-area-inset-bottom,0px))]"
        id="sheet-body"
      >
        {children}
      </div>
    </>
  );

  if (phone)
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent
          className="bg-[var(--surface)] pt-[env(safe-area-inset-top,0px)] text-[length:inherit] data-[vaul-drawer-direction=bottom]:mt-0 data-[vaul-drawer-direction=bottom]:h-[100dvh] data-[vaul-drawer-direction=bottom]:max-h-none data-[vaul-drawer-direction=bottom]:rounded-none data-[vaul-drawer-direction=bottom]:border-0"
          onOpenAutoFocus={onOpenAutoFocus}
          onCloseAutoFocus={onCloseAutoFocus}
        >
          {parts}
        </DrawerContent>
      </Drawer>
    );
  return (
    <SheetShell open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        showCloseButton={false}
        className="gap-0 border-[var(--line-strong)] bg-[var(--surface)] pt-[env(safe-area-inset-top,0px)] text-[length:inherit] data-[side=right]:sm:w-full data-[side=right]:sm:max-w-[640px]"
        onOpenAutoFocus={onOpenAutoFocus}
        onCloseAutoFocus={onCloseAutoFocus}
      >
        {parts}
      </SheetContent>
    </SheetShell>
  );
};
