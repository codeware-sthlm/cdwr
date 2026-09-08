'use client';

import { t } from '@codeware/shared/util/i18n';
import type {
  BlockFieldMeta,
  BlockMeta
} from '@codeware/shared/util/payload-utils';
import { cn } from '@codeware/shared/util/ui';
import { ArrowLeftIcon, ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';

import { usePayload } from '../providers/PayloadProvider';

import {
  type BlockExample,
  type BlockGalleryDoc,
  localized
} from './gallery-doc';

/**
 * Draws a list of blocks.
 *
 * Supplied by `RenderBlocks` through `resolveBlockProps`, never imported —
 * that module imports this one, and reaching back would close the cycle.
 */
export type RenderExample = React.FC<{ blocks: Array<BlockExample> }>;

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
  const nested = depth > 0;

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
          {field.required && (
            <span className="text-muted-foreground ml-0.5" aria-hidden>
              *
            </span>
          )}
        </code>
        <span
          className={cn(
            'text-muted-foreground leading-relaxed',
            nested ? 'text-xs' : 'text-[13px]'
          )}
        >
          {field.description ?? field.label ?? field.type}
        </span>
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

      <header className="mt-8 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl">
          {/* The registered label rides along whenever the heading is not it,
              so a name written for a reader never costs an editor the name
              they have to find in the admin */}
          <p className="font-mono text-xs">
            <span className="text-core-link">{meta.slug}</span>
            {name && (
              <span className="text-muted-foreground"> · {meta.label}</span>
            )}
          </p>
          <h3 className="text-core-headline mt-2.5 text-3xl font-semibold tracking-tight">
            {name ?? meta.label}
          </h3>
          {doc && (
            <p className="text-muted-foreground mt-3 text-base leading-relaxed">
              {localized(doc.summary, locale)}
            </p>
          )}
        </div>

        {meta.availableIn.length > 0 && (
          <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
            <span className={label}>{t(locale, 'gallery.availableIn')}</span>
            <div className="flex flex-wrap gap-1.5">
              {meta.availableIn.map((host) => (
                <span
                  key={host}
                  className="border-border text-muted-foreground rounded-md border px-2 py-1 font-mono text-[11px]"
                >
                  {host}
                </span>
              ))}
            </div>
          </div>
        )}
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
          {doc?.example && RenderExample ? (
            <RenderExample blocks={[doc.example]} />
          ) : (
            <p className="text-muted-foreground text-sm italic">
              {t(locale, 'gallery.noExample')}
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
