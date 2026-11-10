/**
 * shadcn `sheet`, with local extensions.
 *
 * Deviations from upstream — keep this list current so re-running
 * `nx shadcn:add -- sheet` stays a small, reviewable diff:
 *
 * 1. `SheetContent` takes a `container` prop, overriding the portal target
 *    (used by seed-icon-studio to render inside a preview surface).
 * 2. `SheetContent` takes a `size` prop. Upstream hardcodes the width cap to
 *    `sm:max-w-sm`; the widths now come from `sheetContentVariants` instead.
 *    `size="sm"` reproduces upstream exactly and is the default, so pulling a
 *    fresh copy never moves existing call sites.
 * 3. A side sheet is full width below the `sm` breakpoint. Upstream keeps
 *    `w-3/4` at every size, which wastes a quarter of a phone screen.
 *
 * Everything else is byte-identical to upstream on purpose.
 */
import { cn } from '@codeware/shared/util/ui';
import { type VariantProps, cva } from 'class-variance-authority';
import { XIcon } from 'lucide-react';
import { Dialog as SheetPrimitive } from 'radix-ui';
import * as React from 'react';

import { Button } from './button';

/**
 * Local extension: width caps for a side sheet.
 *
 * The cap has to be written per side, because upstream sets it with a
 * `data-[side=…]` variant — an attribute selector outranks a plain
 * `sm:max-w-*` passed via `className`, so a caller cannot override it.
 * Below `sm` every size is full width, overriding upstream's `w-3/4`.
 */
const sheetContentVariants = cva('', {
  variants: {
    size: {
      sm: 'data-[side=left]:sm:max-w-sm data-[side=right]:sm:max-w-sm',
      md: 'data-[side=left]:sm:max-w-md data-[side=right]:sm:max-w-md',
      lg: 'data-[side=left]:sm:max-w-2xl data-[side=right]:sm:max-w-2xl',
      xl: 'data-[side=left]:sm:max-w-4xl data-[side=right]:sm:max-w-4xl'
    }
  },
  defaultVariants: {
    size: 'sm'
  }
});

function Sheet({ ...props }: React.ComponentProps<typeof SheetPrimitive.Root>) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />;
}

function SheetTrigger({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Trigger>) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />;
}

function SheetClose({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Close>) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />;
}

function SheetPortal({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Portal>) {
  return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />;
}

function SheetOverlay({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Overlay>) {
  return (
    <SheetPrimitive.Overlay
      data-slot="sheet-overlay"
      className={cn(
        'data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0 fixed inset-0 z-50 bg-black/50 duration-100',
        className
      )}
      {...props}
    />
  );
}

function SheetContent({
  className,
  children,
  side = 'right',
  size,
  showCloseButton = true,
  container,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Content> &
  VariantProps<typeof sheetContentVariants> & {
    side?: 'top' | 'right' | 'bottom' | 'left';
    showCloseButton?: boolean;
    /** Local extension: portal target override (e.g. seed-icon-studio). */
    container?: HTMLElement | null;
  }) {
  return (
    <SheetPortal container={container ?? undefined}>
      <SheetOverlay />
      <SheetPrimitive.Content
        data-slot="sheet-content"
        data-side={side}
        className={cn(
          'bg-popover text-popover-foreground data-open:animate-in data-open:fade-in-0 data-[side=bottom]:data-open:slide-in-from-bottom-10 data-[side=left]:data-open:slide-in-from-left-10 data-[side=right]:data-open:slide-in-from-right-10 data-[side=top]:data-open:slide-in-from-top-10 data-closed:animate-out data-closed:fade-out-0 data-[side=bottom]:data-closed:slide-out-to-bottom-10 data-[side=left]:data-closed:slide-out-to-left-10 data-[side=right]:data-closed:slide-out-to-right-10 data-[side=top]:data-closed:slide-out-to-top-10 fixed z-50 flex flex-col gap-4 bg-clip-padding text-sm shadow-lg transition duration-200 ease-in-out data-[side=bottom]:inset-x-0 data-[side=bottom]:bottom-0 data-[side=bottom]:h-auto data-[side=bottom]:border-t data-[side=left]:inset-y-0 data-[side=left]:left-0 data-[side=left]:h-full data-[side=left]:w-full data-[side=left]:border-r data-[side=right]:inset-y-0 data-[side=right]:right-0 data-[side=right]:h-full data-[side=right]:w-full data-[side=right]:border-l data-[side=top]:inset-x-0 data-[side=top]:top-0 data-[side=top]:h-auto data-[side=top]:border-b data-[side=left]:sm:w-3/4 data-[side=right]:sm:w-3/4',
          sheetContentVariants({ size }),
          className
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <SheetPrimitive.Close data-slot="sheet-close" asChild>
            <Button
              variant="ghost"
              className="absolute top-3 right-3"
              size="icon-sm"
            >
              <XIcon />
              <span className="sr-only">Close</span>
            </Button>
          </SheetPrimitive.Close>
        )}
      </SheetPrimitive.Content>
    </SheetPortal>
  );
}

function SheetHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="sheet-header"
      className={cn('flex flex-col gap-0.5 p-4', className)}
      {...props}
    />
  );
}

function SheetFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn('mt-auto flex flex-col gap-2 p-4', className)}
      {...props}
    />
  );
}

function SheetTitle({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Title>) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn('text-foreground text-base font-medium', className)}
      {...props}
    />
  );
}

function SheetDescription({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Description>) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn('text-muted-foreground text-sm', className)}
      {...props}
    />
  );
}

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription
};
