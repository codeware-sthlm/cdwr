import { Separator } from '@codeware/shared/ui/shadcn/components/separator';
import type { SpacingBlock as SpacingBlockProps } from '@codeware/shared/util/payload-types';
import { tailwind } from '@codeware/shared/util/tailwind';
import { cn } from '@codeware/shared/util/ui';

type Props = SpacingBlockProps;

/**
 * Render an empty space with optional divider.
 *
 * `RenderBlocks` leaves no margin around a spacing block, so the gap is this
 * block's own margin on both sides. `regular` without a divider matches the
 * gap between any two blocks (`mt-16 md:mt-24`), with `tight` at half of it
 * and `loose` at one and a half — placing one should never shrink the gap.
 */
export const SpacingBlock: React.FC<Props> = ({ color, divider, size }) => {
  return (
    <Separator
      orientation="horizontal"
      className={cn('', {
        'bg-transparent': !divider,
        'my-4 md:my-6': size === 'tight',
        'my-8 md:my-12': size === 'regular',
        'my-12 md:my-18': size === 'loose'
      })}
      style={{
        backgroundColor: divider ? tailwind.colorMaybe(color) : undefined
      }}
    />
  );
};
