'use client';

import { t } from '@codeware/shared/util/i18n';
import type {
  BlockFieldMeta,
  BlockMeta,
  BlocksData
} from '@codeware/shared/util/payload-utils';
import { cn } from '@codeware/shared/util/ui';
import {
  ArrowLeftIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  LanguagesIcon
} from 'lucide-react';

import { usePayload } from '../../providers/PayloadProvider';
import {
  type BlockExample,
  type BlockGalleryDoc,
  localized
} from '../gallery-doc';

/**
 * Draws a list of blocks.
 *
 * Supplied by `RenderBlocks` through `resolveBlockProps`, never imported —
 * that module imports this one, and reaching back would close the cycle.
 */
export type RenderExample = React.FC<{
  blocks: Array<BlockExample>;
  blocksData?: BlocksData;
  preview?: boolean;
}>;

/**
 * The small uppercase labels above each region.
 *
 * Full-strength ink rather than muted: they used to share
 * `text-muted-foreground` with both the prose and the field descriptions, which
 * left nothing to mark them as labels. Colour is deliberately not the signal —
 * the slug, the live bar and the field names already carry the brand, and a
 * fourth would be noise.
 */
const label =
  'text-foreground font-mono text-[11px] font-semibold tracking-[0.14em] uppercase';

/**
 * One row of the field table.
 *
 * A fixed name column rather than an indented row, so every description shares
 * one left edge however deep its field sits — indenting the whole row moved the
 * prose with it and the column stopped reading as a column. Nesting is carried
 * by the name alone, which is also what makes a child field look subordinate
 * rather than like a second first-level field.
 */
function FieldRow({ field, depth }: { field: BlockFieldMeta; depth: number }) {
  const { locale } = usePayload();
  const nested = depth > 0;
  const translated = t(locale, 'gallery.localized');
  const inLocale = (text?: Record<string, string>) =>
    text && localized(text, locale);

  return (
    <>
      <div
        style={
          { '--field-indent': `${depth * 0.875}rem` } as React.CSSProperties
        }
        className={cn(
          'border-border/70 grid gap-x-4 gap-y-0.5 border-b px-4 last:border-b-0',
          // Two columns from `sm`, where the name is indented and every
          // description keeps one left edge. Below that the pair stacks and
          // there is no column to align to, so the whole row moves instead —
          // indenting the name alone left its description flush with the
          // level above it
          'pl-[calc(1rem+var(--field-indent))] sm:grid-cols-[9rem_minmax(0,1fr)] sm:pl-4',
          nested ? 'py-1.5' : 'py-2.5'
        )}
      >
        <code
          className={cn(
            'font-mono sm:pl-[var(--field-indent)]',
            nested
              ? 'text-muted-foreground text-[11px]'
              : 'text-core-link text-xs'
          )}
        >
          {field.name}
          {/* The star is the familiar mark; the word is what a screen reader
              gets, since the star alone is decoration */}
          {field.required && (
            <>
              <span className="text-muted-foreground ml-0.5" aria-hidden>
                *
              </span>
              <span className="sr-only">
                {` ${t(locale, 'gallery.required')}`}
              </span>
            </>
          )}
          {field.localized && (
            <span title={translated}>
              <LanguagesIcon
                className="text-muted-foreground ml-1 inline size-3 align-[-2px]"
                aria-hidden
              />
              <span className="sr-only">{` ${translated}`}</span>
            </span>
          )}
        </code>
        <div
          className={cn(
            'text-muted-foreground leading-relaxed',
            nested ? 'text-xs' : 'text-[13px]'
          )}
        >
          {inLocale(field.description) ?? inLocale(field.label) ?? field.type}
          {/* Payload shows it only when a sibling says so, which is what makes
              its required star conditional rather than a promise */}
          {field.conditional && (
            <p className="mt-1 text-xs italic">
              {t(locale, 'gallery.conditional')}
            </p>
          )}
          {/* A blocks field is only described by what it holds */}
          {field.blocks && field.blocks.length > 0 && (
            <p className="mt-1 flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 text-xs">
              <span>{t(locale, 'gallery.accepts')}</span>
              {field.blocks.map((slug) => (
                <code key={slug} className="text-core-link font-mono">
                  {slug}
                </code>
              ))}
            </p>
          )}
        </div>
      </div>
      {field.fields?.map((child) => (
        <FieldRow key={child.name} field={child} depth={depth + 1} />
      ))}
    </>
  );
}

/**
 * One block: a live instance first, then what it is for and what to fill in.
 *
 * The example leads because it is the argument — drawn by the same renderer a
 * page uses, following whichever theme the visitor picked, rather than a
 * screenshot that stopped being true three releases ago.
 */
export function BlockGalleryEntry({
  meta,
  doc,
  render: RenderExample,
  onBack,
  onStep,
  position
}: {
  meta: BlockMeta;
  doc?: BlockGalleryDoc;
  render?: RenderExample;
  onBack: () => void;
  onStep: (delta: number) => void;
  position: { index: number; total: number };
}) {
  const { locale } = usePayload();
  const name = doc?.name && localized(doc.name, locale);

  return (
    <article>
      <div className="border-border flex flex-wrap items-center justify-between gap-3 border-b pb-4">
        <button
          type="button"
          onClick={onBack}
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm font-medium transition-colors"
        >
          <ArrowLeftIcon className="size-4" />
          {t(locale, 'gallery.allBlocks')}
        </button>

        <div className="flex items-center gap-3">
          <span className="text-muted-foreground font-mono text-xs tabular-nums">
            {position.index + 1} / {position.total}
          </span>
          {[
            { delta: -1, Icon: ChevronLeftIcon, key: 'gallery.previous' },
            { delta: 1, Icon: ChevronRightIcon, key: 'gallery.next' }
          ].map(({ delta, Icon, key }) => (
            <button
              key={key}
              type="button"
              onClick={() => onStep(delta)}
              aria-label={t(locale, key as 'gallery.next')}
              className="border-border text-foreground hover:border-core-interactive rounded-lg border p-1.5 transition-colors"
            >
              <Icon className="size-4" />
            </button>
          ))}
        </div>
      </div>

      {/* Aligned to the top rather than the baseline: the summary varies in
          length from block to block, and an end-aligned column made the
          metadata jump vertically as the visitor stepped through */}
      <header className="mt-8 flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-2xl">
          <code className="text-core-link font-mono text-xs">{meta.slug}</code>
          <h3 className="text-core-headline mt-2.5 text-3xl font-semibold tracking-tight">
            {name ?? localized(meta.label, locale)}
          </h3>
          {doc && (
            <p className="text-muted-foreground mt-3 text-base leading-relaxed">
              {localized(doc.summary, locale)}
            </p>
          )}
        </div>

        <dl className="flex shrink-0 flex-col gap-4 sm:items-end sm:text-right">
          {/* The block's registered label — its name wherever the admin offers
              it, which for several blocks is more than one place: the layout
              builder, and inside a content block's rich text or inline blocks.
              Naming a single surface here was wrong for exactly those. Shown
              only when the heading is not already the label, so a name written
              for a reader never costs an editor the one they search for */}
          {name && (
            <div className="flex flex-col gap-1.5">
              <dt className={label}>{t(locale, 'gallery.nameInAdmin')}</dt>
              <dd className="text-muted-foreground text-[13px]">
                {localized(meta.label, locale)}
              </dd>
            </div>
          )}
          {meta.availableIn.length > 0 && (
            <div className="flex flex-col gap-2">
              <dt className={label}>{t(locale, 'gallery.availableIn')}</dt>
              <dd className="flex flex-wrap gap-1.5 sm:justify-end">
                {meta.availableIn.map((host) => (
                  <span
                    key={host}
                    className="border-border text-muted-foreground rounded-md border px-2 py-1 font-mono text-[11px]"
                  >
                    {host}
                  </span>
                ))}
              </dd>
            </div>
          )}
        </dl>
      </header>

      {/* The example leads, and is framed so it reads as the site's own
          surface rather than as another paragraph about the block */}
      <section className="mt-9">
        <div className="border-border bg-card/60 flex flex-wrap items-center justify-between gap-2 rounded-t-xl border px-4 py-2.5">
          <span className="text-core-link font-mono text-[11px] tracking-[0.12em] uppercase">
            {t(locale, 'gallery.live')}
          </span>
          <span className="text-muted-foreground text-xs">
            {t(locale, 'gallery.liveNote')}
          </span>
        </div>
        <div className="border-border bg-core-background-content rounded-b-xl border border-t-0 px-6 py-10 sm:px-10 sm:py-12">
          {doc && RenderExample ? (
            <RenderExample
              blocks={[doc.example]}
              blocksData={doc.exampleData}
              preview
            />
          ) : (
            // Only two states left: a block draws, or nobody has written it up
            // — and one that no page offers says that instead
            <p className="text-muted-foreground text-sm italic">
              {t(
                locale,
                meta.availableIn.length === 0
                  ? 'gallery.notOffered'
                  : 'gallery.undocumented'
              )}
            </p>
          )}
        </div>
      </section>

      <div className="mt-11 grid gap-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <div>
          <h4 className={label}>{t(locale, 'gallery.whenToUse')}</h4>
          <p className="text-foreground/85 mt-3.5 text-[15px] leading-[1.75]">
            {doc ? (
              localized(doc.whenToUse, locale)
            ) : (
              <span className="text-muted-foreground italic">
                {t(locale, 'gallery.undocumented')}
              </span>
            )}
          </p>
        </div>

        <div>
          <h4 className={label}>{t(locale, 'gallery.fields')}</h4>
          <div className="border-border bg-card/40 mt-3.5 overflow-hidden rounded-xl border">
            {meta.fields.map((field) => (
              <FieldRow key={field.name} field={field} depth={0} />
            ))}
          </div>
          <p className="text-muted-foreground mt-3 text-[13px] leading-relaxed">
            {t(locale, 'gallery.fieldsNote')}
          </p>
        </div>
      </div>
    </article>
  );
}
