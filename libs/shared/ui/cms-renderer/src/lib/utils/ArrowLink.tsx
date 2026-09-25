import { cn } from '@codeware/shared/util/ui';
import { ArrowRightIcon } from '@heroicons/react/24/outline';
import { type VariantProps, cva } from 'class-variance-authority';
import type { ComponentProps } from 'react';

const arrowLink = cva(
  'group/link inline-flex items-center text-sm font-medium transition-colors',
  {
    variants: {
      variant: {
        text: 'text-core-link gap-1 underline-offset-4 hover:underline',
        outline:
          'border-border text-foreground hover:border-core-link hover:text-core-link gap-1.5 rounded-lg border px-4 py-2'
      }
    },
    defaultVariants: { variant: 'text' }
  }
);

type ArrowLinkProps = ComponentProps<'button'> & VariantProps<typeof arrowLink>;

/**
 * A link ending in an arrow, the same wherever a block offers one. The arrow
 * nudges toward where it leads, unless reduced motion is asked for.
 */
export function ArrowLink({
  variant,
  className,
  children,
  ...props
}: ArrowLinkProps) {
  return (
    <button
      type="button"
      className={cn(arrowLink({ variant }), className)}
      {...props}
    >
      {children}
      <ArrowRightIcon className="size-4 transition-transform motion-safe:group-hover/link:translate-x-0.5 motion-safe:group-focus-visible/link:translate-x-0.5" />
    </button>
  );
}
