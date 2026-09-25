import { cn } from '@codeware/shared/util/ui';
import type { CSSProperties } from 'react';

import { type TechBrand, techIconsMap } from './tech-icons';

type TechIconProps = {
  brand: TechBrand;
  /**
   * Whether it sits on a surface that stays dark in either colour scheme.
   * A dark mark then takes the text colour, as it does in dark mode.
   */
  onDark?: boolean;
} & React.ComponentPropsWithoutRef<'svg'>;

/**
 * A technology's mark in its brand colour, or in the text colour where that
 * colour would disappear. Decorative: the label beside it carries the name.
 */
export const TechIcon: React.FC<TechIconProps> = ({
  brand,
  onDark = false,
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
      style={{ '--brand': tech.hex, ...style } as CSSProperties}
      className={cn(
        'shrink-0 text-(--brand)',
        tech.dark && (onDark ? 'text-current' : 'dark:text-current'),
        className
      )}
      {...props}
    />
  );
};
