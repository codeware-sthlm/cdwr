import { Button } from '@codeware/shared/ui/shadcn/components/button';
import type { CalloutBlock as CalloutBlockProps } from '@codeware/shared/util/payload-types';
import { cn } from '@codeware/shared/util/ui';

import { usePayload } from '../../providers/PayloadProvider';
import { resolveLinkGroup } from '../../utils/resolve-link-group';
import { TenantIcon } from '../../utils/TenantIcon';
import { ImageBlock } from '../image/ImageBlock';

/**
 * Callout block — compact centered CTA band ("mini hero").
 * Optional cloud mark, heading, short body, single action button.
 */
export const CalloutBlock: React.FC<CalloutBlockProps> = ({
  showMark,
  heading,
  body,
  image,
  link
}) => {
  const { navigate, iconConfig } = usePayload();
  const resolved = resolveLinkGroup(link);
  // An id alone is an unpopulated relation, which ImageBlock renders as nothing
  const shownImage = image && typeof image === 'object' ? image : null;

  return (
    <section
      className={cn(
        'flex',
        // An image turns the band from a centred call into a two-column one,
        // so the text stops competing with it for the middle
        shownImage
          ? 'flex-col items-start gap-9 text-left sm:flex-row sm:items-center sm:gap-12'
          : 'flex-col items-center text-center'
      )}
    >
      <div
        className={cn(
          'flex min-w-0 flex-col',
          shownImage ? 'flex-1 items-start' : 'w-full items-center'
        )}
      >
        {showMark && iconConfig && (
          <div className="text-core-link mb-6">
            <TenantIcon config={iconConfig} size={48} />
          </div>
        )}
        <h2 className="text-core-headline max-w-2xl text-3xl font-semibold tracking-tight md:text-4xl">
          {heading}
        </h2>
        {body && (
          <p className="text-muted-foreground mt-4 max-w-md text-base leading-relaxed">
            {body}
          </p>
        )}
        {resolved && (
          <div className="mt-8">
            <Button onClick={() => navigate(resolved.path, resolved.newTab)}>
              {resolved.label}
            </Button>
          </div>
        )}
      </div>
      {shownImage && (
        <div className="w-full sm:max-w-sm">
          <ImageBlock media={shownImage} hideCaption />
        </div>
      )}
    </section>
  );
};
