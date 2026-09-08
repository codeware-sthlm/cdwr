import { Button } from '@codeware/shared/ui/shadcn/components/button';
import type { HeroBlock as HeroBlockProps } from '@codeware/shared/util/payload-types';

import { usePayload } from '../../providers/PayloadProvider';
import { resolveLinkGroup } from '../../utils/resolve-link-group';
import { TenantIcon } from '../../utils/TenantIcon';
import { ImageBlock } from '../image/ImageBlock';

/**
 * Hero block — page opener with badge, headline, lede and up to two CTA buttons.
 */
export const HeroBlock: React.FC<HeroBlockProps> = ({
  badge,
  heading,
  lede,
  actions,
  media
}) => {
  const { navigate, iconConfig } = usePayload();

  return (
    <section>
      {badge && (
        <div className="border-border bg-card text-core-link mb-6 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm">
          <TenantIcon config={iconConfig} size={16} />
          <span>{badge}</span>
        </div>
      )}
      <h1 className="text-core-headline max-w-3xl text-4xl font-semibold tracking-tight md:text-5xl lg:text-6xl">
        {heading}
      </h1>
      <p className="text-muted-foreground mt-6 max-w-xl text-lg leading-relaxed">
        {lede}
      </p>
      {!!actions?.length && (
        <div className="mt-8 flex flex-wrap gap-3">
          {actions.map((action, i) => {
            const resolved = resolveLinkGroup(action.link);
            if (!resolved) return null;
            return (
              <Button
                key={i}
                variant={
                  action.emphasis === 'secondary' ? 'outline' : 'default'
                }
                onClick={() => navigate(resolved.path, resolved.newTab)}
              >
                {resolved.label}
              </Button>
            );
          })}
        </div>
      )}
      {/* An id alone is an unpopulated relation, which renders as nothing */}
      {media && typeof media === 'object' && (
        <div className="mt-12">
          <ImageBlock media={media} hideCaption />
        </div>
      )}
    </section>
  );
};
