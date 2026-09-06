import { cn } from '@codeware/shared/util/ui';
import * as React from 'react';

function Card({
  className,
  size = 'default',
  variant = 'default',
  interactive = false,
  ...props
}: React.ComponentProps<'div'> & {
  size?: 'default' | 'sm';
  /**
   * `bordered` trades the ring for a border and a shadow.
   *
   * Payload's own card is bordered, so the admin matches its chrome rather
   * than shadcn's ring-first default. A named variant rather than eight
   * hand-copied class lists, which is what it was.
   */
  variant?: 'default' | 'bordered';
  /**
   * Whether the card is the target of a click, and says so on hover.
   *
   * Pointer and keyboard, on the card and on a wrapper: some of these cards
   * sit inside a link that carries the `group` and takes the focus itself, so
   * the card's own `focus-within` never matches. The `group-*` rules are inert
   * without such an ancestor.
   */
  interactive?: boolean;
}) {
  return (
    <div
      data-slot="card"
      data-size={size}
      data-variant={variant}
      data-interactive={interactive || undefined}
      className={cn(
        'group/card bg-card text-card-foreground ring-foreground/10 flex flex-col gap-(--card-spacing) overflow-hidden rounded-xl py-(--card-spacing) text-sm ring-1 [--card-spacing:--spacing(4)] has-data-[slot=card-footer]:pb-0 has-[>img:first-child]:pt-0 data-[size=sm]:[--card-spacing:--spacing(3)] data-[size=sm]:has-data-[slot=card-footer]:pb-0 *:[img:first-child]:rounded-t-xl *:[img:last-child]:rounded-b-xl',
        'data-[variant=bordered]:border-border data-[variant=bordered]:border data-[variant=bordered]:shadow-xs data-[variant=bordered]:ring-0',
        'data-[interactive]:hover:border-core-interactive data-[interactive]:focus-within:border-core-interactive data-[interactive]:group-hover:border-core-interactive data-[interactive]:group-focus-within:border-core-interactive data-[interactive]:transition-[border-color,box-shadow] data-[interactive]:duration-150 data-[interactive]:group-focus-within:shadow-md data-[interactive]:group-hover:shadow-md data-[interactive]:focus-within:shadow-md data-[interactive]:hover:shadow-md',
        className
      )}
      {...props}
    />
  );
}

function CardHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        'group/card-header @container/card-header grid auto-rows-min items-start gap-1 rounded-t-xl px-(--card-spacing) has-data-[slot=card-action]:grid-cols-[1fr_auto] has-data-[slot=card-description]:grid-rows-[auto_auto] [.border-b]:pb-(--card-spacing)',
        className
      )}
      {...props}
    />
  );
}

function CardTitle({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-title"
      className={cn(
        'text-base leading-snug font-medium group-data-[size=sm]/card:text-sm',
        className
      )}
      {...props}
    />
  );
}

function CardDescription({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-description"
      className={cn('text-muted-foreground text-sm', className)}
      {...props}
    />
  );
}

function CardAction({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        'col-start-2 row-span-2 row-start-1 self-start justify-self-end',
        className
      )}
      {...props}
    />
  );
}

function CardContent({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-content"
      className={cn('px-(--card-spacing)', className)}
      {...props}
    />
  );
}

function CardFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-footer"
      className={cn(
        'bg-muted/50 flex items-center rounded-b-xl border-t p-(--card-spacing)',
        className
      )}
      {...props}
    />
  );
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent
};
