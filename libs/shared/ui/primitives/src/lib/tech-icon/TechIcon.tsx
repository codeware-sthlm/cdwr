import { cn } from '@codeware/shared/util/ui';
import type { CSSProperties } from 'react';

import { type TechBrand, techIconsMap } from './tech-icons';

type TechIconProps = {
  brand: TechBrand;
  /** Take the surrounding text colour instead of the brand's */
  followText?: boolean;
} & React.ComponentPropsWithoutRef<'svg'>;

/**
 * A technology's mark in its brand colour, or in the text colour where that
 * colour would disappear: in dark mode, and inside anything marked `.dark`.
 * Decorative: the label beside it carries the name.
 */
export const TechIcon: React.FC<TechIconProps> = ({
  brand,
  followText,
  className,
  style,
  ...props
}) => {
  const tech = techIconsMap[brand];

  if (!tech) {
    return null;
  }

  return (
    <tech.Component
      aria-hidden
      style={
        followText
          ? style
          : ({ '--brand': tech.hex, ...style } as CSSProperties)
      }
      className={cn(
        'shrink-0',
        !followText && 'text-(--brand)',
        !followText && tech.dark && 'dark:text-current',
        className
      )}
      {...props}
    />
  );
};
