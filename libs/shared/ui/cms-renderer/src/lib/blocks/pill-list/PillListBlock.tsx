import { InlineIcon, TechIcon } from '@codeware/shared/ui/primitives';
import type { PillListBlock as PillListBlockProps } from '@codeware/shared/util/payload-types';
import { cn } from '@codeware/shared/util/ui';

type Pill = NonNullable<PillListBlockProps['items']>[number];

/** The mark from the platform's list, else the tenant's own, else nothing */
function PillLogo({ pill, onDark }: { pill: Pill; onDark: boolean }) {
  if (pill.icon) {
    return <TechIcon brand={pill.icon} onDark={onDark} className="size-4" />;
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
 * Pill list block — labelled pills with optional links.
 *
 * `dark` surface: signature eerie-black band (always dark, regardless of page theme).
 * `light` surface: sits on the content surface with theme-native tokens.
 */
export const PillListBlock: React.FC<PillListBlockProps> = ({
  eyebrow,
  heading,
  intro,
  surface,
  items
}) => {
  if (!items?.length) return null;

  const isDark = surface !== 'light';

  return (
    <section
      className={cn('rounded-2xl px-8 py-12 md:px-12 md:py-16', {
        'bg-core-surface-invert': isDark
      })}
    >
      <div className="mb-9 max-w-xl">
        {eyebrow && (
          <p
            className={cn(
              'text-sm font-semibold tracking-[0.14em] uppercase',
              isDark ? 'text-white/70' : 'text-core-link'
            )}
          >
            {eyebrow}
          </p>
        )}
        {heading && (
          <h2
            className={cn(
              'mt-3 text-3xl font-semibold tracking-tight',
              isDark ? 'text-white' : 'text-core-headline'
            )}
          >
            {heading}
          </h2>
        )}
        {intro && (
          <p
            className={cn(
              'mt-3.5 text-base leading-relaxed',
              isDark ? 'text-white/70' : 'text-muted-foreground'
            )}
          >
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
              className={cn(
                'inline-flex items-center gap-2 rounded-full border px-3 py-1 font-mono text-sm transition-colors',
                isDark
                  ? 'border-white/20 text-white hover:border-white/50'
                  : 'border-border text-foreground hover:border-core-link hover:text-core-link'
              )}
            >
              <PillLogo pill={item} onDark={isDark} />
              {item.label}
            </a>
          ) : (
            <span
              key={i}
              className={cn(
                'inline-flex items-center gap-2 rounded-full border px-3 py-1 font-mono text-sm',
                isDark
                  ? 'border-white/20 text-white/80'
                  : 'border-border text-foreground'
              )}
            >
              <PillLogo pill={item} onDark={isDark} />
              {item.label}
            </span>
          )
        )}
      </div>
    </section>
  );
};
