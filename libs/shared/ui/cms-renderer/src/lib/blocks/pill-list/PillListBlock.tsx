import { InlineIcon, TechIcon } from '@codeware/shared/ui/primitives';
import type { PillListBlock as PillListBlockProps } from '@codeware/shared/util/payload-types';

type Pill = NonNullable<PillListBlockProps['items']>[number];

/** The mark from the platform's list, else the tenant's own, else nothing */
function PillLogo({ pill }: { pill: Pill }) {
  if (pill.icon) {
    return <TechIcon brand={pill.icon} className="size-4" />;
  }

  const { source, svgCode, file } = pill.logo ?? {};

  if (source === 'svg' && svgCode) {
    return <InlineIcon svgCode={svgCode} size={16} />;
  }

  // An id alone is an unpopulated relation, which renders as nothing
  if (source === 'upload' && file && typeof file === 'object' && file.url) {
    return <InlineIcon src={file.url} size={16} />;
  }

  return null;
}

/**
 * Pill list block — labelled pills with optional links and logos.
 *
 * Draws no surface of its own: a band behind it is the block's `band` setting,
 * which the renderer draws for every block alike.
 */
export const PillListBlock: React.FC<PillListBlockProps> = ({
  eyebrow,
  heading,
  intro,
  items
}) => {
  if (!items?.length) return null;

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

      <div className="flex flex-wrap gap-2">
        {items.map((item, i) =>
          item.url ? (
            <a
              key={i}
              href={item.url}
              target="_blank"
              rel="noreferrer"
              className="border-border text-foreground hover:border-core-link hover:text-core-link inline-flex items-center gap-2 rounded-full border px-3 py-1 font-mono text-sm transition-colors"
            >
              <PillLogo pill={item} />
              {item.label}
            </a>
          ) : (
            <span
              key={i}
              className="border-border text-foreground inline-flex items-center gap-2 rounded-full border px-3 py-1 font-mono text-sm"
            >
              <PillLogo pill={item} />
              {item.label}
            </span>
          )
        )}
      </div>
    </section>
  );
};
