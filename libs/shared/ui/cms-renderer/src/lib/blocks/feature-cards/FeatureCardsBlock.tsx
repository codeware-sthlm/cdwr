import { HeroIcon, type HeroIconName } from '@codeware/shared/ui/primitives';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle
} from '@codeware/shared/ui/shadcn/components/card';
import type { FeatureCardsBlock as FeatureCardsBlockProps } from '@codeware/shared/util/payload-types';
import { type TailwindColor } from '@codeware/shared/util/tailwind';
import { cn } from '@codeware/shared/util/ui';

/**
 * Feature cards render component — reference for the marketing section blocks.
 * Mirrors CardBlock conventions: shadcn primitives, cn, HeroIcon, --core-* tokens.
 */
export const FeatureCardsBlock: React.FC<FeatureCardsBlockProps> = ({
  eyebrow,
  heading,
  intro,
  columns,
  items
}) => {
  if (!items?.length) return null;

  const resolved =
    columns && columns !== 'auto' ? Number(columns) : Math.min(items.length, 4);

  return (
    <section>
      <div className="mb-9 max-w-xl">
        {eyebrow && (
          <p className="text-core-link text-sm font-semibold tracking-[0.14em] uppercase">
            {eyebrow}
          </p>
        )}
        {heading && (
          <h2 className="text-core-headline mt-3 text-3xl font-semibold tracking-tight">
            {heading}
          </h2>
        )}
        {intro && (
          <p className="text-muted-foreground mt-3.5 text-base leading-relaxed">
            {intro}
          </p>
        )}
      </div>

      <div
        className={cn('grid grid-cols-1 gap-4', {
          'sm:grid-cols-2': resolved >= 2,
          'lg:grid-cols-3': resolved === 3,
          'lg:grid-cols-4': resolved >= 4
        })}
      >
        {items.map((item, i) => {
          const { icon, color } = item.brand ?? {};
          return (
            <Card
              key={i}
              className="bg-card/50 hover:bg-card border transition-all duration-300 ease-in-out"
            >
              <CardHeader>
                {icon && (
                  <span className="bg-core-link/10 text-core-link mb-4 flex size-11 items-center justify-center rounded-xl">
                    <HeroIcon
                      icon={icon as HeroIconName}
                      color={color as TailwindColor}
                      className="size-5"
                    />
                  </span>
                )}
                <CardTitle className="text-card-foreground text-lg">
                  {item.title}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-muted-foreground text-sm leading-relaxed">
                {item.description}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
};
