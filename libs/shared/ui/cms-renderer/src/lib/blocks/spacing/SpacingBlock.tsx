import { Separator } from '@codeware/shared/ui/shadcn/components/separator';
import type { SpacingBlock as SpacingBlockProps } from '@codeware/shared/util/payload-types';
import { tailwind } from '@codeware/shared/util/tailwind';
import { cn } from '@codeware/shared/util/ui';

type Props = SpacingBlockProps;

/**
 * Render an empty space with optional divider.
 *
 * A regular spacing without a divider should match the default margin beween blocks in RenderBlocks.
 */
export const SpacingBlock: React.FC<Props> = ({ color, divider, size }) => {
  return (
    <Separator
      orientation="horizontal"
      className={cn('', {
        'bg-transparent': !divider,
        'my-2': size === 'tight',
        'my-4': size === 'regular', // Match mt-8
        'my-6': size === 'loose'
      })}
      style={{
        backgroundColor: divider ? tailwind.colorMaybe(color) : undefined
      }}
    />
  );
};
