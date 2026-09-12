'use client';

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@codeware/shared/ui/shadcn/components/dialog';
import {
  ToggleGroup,
  ToggleGroupItem
} from '@codeware/shared/ui/shadcn/components/toggle-group';
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
  LanguagesIcon,
  MoonStarIcon,
  SunIcon,
  XIcon
} from 'lucide-react';
import { useState } from 'react';

import { usePayload } from '../../providers/PayloadProvider';
import { segment, segmentTrack } from '../../theme/chrome';
import {
  type AnyBlockGalleryDoc,
  type BlockExample,
  hasExample,
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
 * The mark that says this is the block itself, not a picture of it.
 *
 * Written once and worn by both frames: the panel on the page and the one that
 * takes the whole window are the same claim, so they say it the same way.
 */
function LiveTag() {
  const { locale } = usePayload();

  return (
    <span className="text-core-link flex shrink-0 items-center gap-2 font-mono text-[11px] tracking-[0.12em] uppercase">
      <span className="relative flex size-2" aria-hidden>
        <span className="bg-core-link absolute inline-flex size-full animate-ping rounded-full opacity-60" />
        <span className="bg-core-link relative inline-flex size-2 rounded-full" />
      </span>
      {t(locale, 'gallery.live')}
    </span>
  );
}

/**
 * Light or dark, for trying a block in both.
 *
 * Two segments rather than the site's own switch: `system` is a preference
 * already answered by the page around it, and the third option costs room the
 * block would rather have. Square whatever the site's chrome is — this belongs
 * to the gallery's frame, not to the site being previewed. Nothing to show on
 * a site that fixes its scheme.
 */
function SchemeSwitch() {
  const { locale, lockedColorScheme, resolvedColorScheme, setColorScheme } =
    usePayload();

  if (lockedColorScheme !== null) {
    return null;
  }

  return (
    <ToggleGroup
      type="single"
      value={resolvedColorScheme ?? 'light'}
      // Radix clears the value when the active item is pressed again, and
      // there is no "no scheme" to fall back to
      onValueChange={(next) => next && setColorScheme(next as 'light' | 'dark')}
      spacing={0}
      size="sm"
      aria-label={t(locale, 'colorScheme.select')}
      className={segmentTrack()}
    >
      {(
        [
          { value: 'light', Icon: SunIcon },
          { value: 'dark', Icon: MoonStarIcon }
        ] as const
      ).map(({ value, Icon }) => {
        const label = t(locale, `colorScheme.${value}`);

        return (
          <ToggleGroupItem
            key={value}
            value={value}
            aria-label={label}
            title={label}
            className={segment()}
          >
            <Icon className="size-4 stroke-[1.5]" />
          </ToggleGroupItem>
        );
      })}
    </ToggleGroup>
  );
}

/** Step to the block before or after this one. */
function StepButtons({
  onStep,
  className
}: {
  onStep: (delta: number) => void;
  className: string;
}) {
  const { locale } = usePayload();

  return (
    <>
      {[
        { delta: -1, Icon: ChevronLeftIcon, key: 'gallery.previous' },
        { delta: 1, Icon: ChevronRightIcon, key: 'gallery.next' }
      ].map(({ delta, Icon, key }) => (
        <button
          key={key}
          type="button"
          onClick={() => onStep(delta)}
          aria-label={t(locale, key as 'gallery.next')}
          className={className}
        >
          <Icon className="size-4" />
        </button>
      ))}
    </>
  );
}

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
  doc?: AnyBlockGalleryDoc;
  render?: RenderExample;
  onBack: () => void;
  onStep: (delta: number) => void;
  position: { index: number; total: number };
}) {
  const { locale } = usePayload();
  const [expanded, setExpanded] = useState(false);
  const name = doc?.name && localized(doc.name, locale);

  // Nothing is drawn for a block nobody has written up, or one no page offers
  const drawn = Boolean(doc && hasExample(doc) && RenderExample);

  // Drawn once and shown twice: framed on the page, and again at full size
  const preview =
    doc && hasExample(doc) && RenderExample ? (
      <RenderExample
        blocks={[doc.example]}
        blocksData={doc.exampleData}
        preview
      />
    ) : (
      <p className="text-muted-foreground text-sm italic">
        {t(
          locale,
          meta.availableIn.length === 0
            ? 'gallery.notOffered'
            : 'gallery.undocumented'
        )}
      </p>
    );

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
          <StepButtons
            onStep={onStep}
            className="border-border text-foreground hover:border-core-interactive rounded-lg border p-1.5 transition-colors"
          />
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
          surface rather than as another paragraph about the block. Ringed and
          lifted, with a live dot: sharing the page's own border left the one
          thing being demonstrated looking like more prose about it */}
      <section
        className={cn(
          'mt-9 overflow-hidden rounded-xl shadow-lg ring-1',
          // The live colours are a claim about what is below them, so a frame
          // carrying a sentence instead of a block does not wear them
          drawn ? 'ring-core-link/25' : 'ring-border'
        )}
      >
        <div
          className={cn(
            'flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5',
            drawn
              ? 'border-core-link/20 bg-core-link/10'
              : 'border-border bg-card/60'
          )}
        >
          {drawn ? (
            <LiveTag />
          ) : (
            <span className="text-muted-foreground font-mono text-[11px] tracking-[0.12em] uppercase">
              {t(locale, 'gallery.example')}
            </span>
          )}
          <span className="flex items-center gap-2">
            {drawn && (
              <span className="text-muted-foreground mr-1 hidden text-xs sm:inline">
                {t(locale, 'gallery.liveNote')}
              </span>
            )}
            {/* Stepping sits here as well as at the top: flicking through the
                library from the thing being looked at should not cost a scroll
                back to the heading */}
            <StepButtons
              onStep={onStep}
              className="border-core-link/30 text-core-link hover:bg-core-link/10 rounded-md border p-1 transition-colors"
            />
            {/* A block is drawn for a page, not for a panel inside one, so the
                frame shows it smaller and hands over the whole viewport when
                asked. Nothing to hand over when nothing is drawn */}
            {drawn && (
              <button
                type="button"
                onClick={() => setExpanded(true)}
                className="border-core-link/30 text-core-link hover:bg-core-link/10 rounded-md border px-2 py-0.5 text-[11px] font-medium transition-colors"
              >
                {t(locale, 'gallery.expand')}
              </button>
            )}
          </span>
        </div>
        {/* `zoom` rather than a transform: it shrinks the drawing and the space
            it takes, so the frame closes around the block instead of holding
            room for a size it is not being shown at */}
        <div
          className={cn(
            'bg-core-background-content px-6 py-10 sm:px-10 sm:py-12',
            drawn && '[zoom:0.7] sm:[zoom:0.78] xl:[zoom:0.86]'
          )}
        >
          {preview}
        </div>
      </section>

      {/* Full width, no scaling, and the stepper carried in: the reason to
          open it is to see the block at the size a visitor would */}
      <Dialog open={expanded} onOpenChange={setExpanded}>
        {/* The dialog's own close sits at the top corner, which is above the
            middle of a bar carrying two lines — so it closes from the row, in
            line with the controls beside it */}
        <DialogContent
          showCloseButton={false}
          className="flex h-[100dvh] w-screen max-w-none flex-col gap-0 rounded-none p-0 sm:max-w-none"
        >
          {/* The same tinted bar as the framed example, for the same reason:
              what is below it is the block itself, drawn by the renderer that
              serves a page */}
          <DialogHeader className="border-core-link/20 bg-core-link/10 flex-row flex-wrap items-center justify-between gap-3 border-b px-4 py-2.5">
            <div className="flex min-w-0 items-center gap-3">
              <LiveTag />
              <div className="min-w-0">
                <DialogTitle className="truncate text-sm font-medium">
                  {name ?? localized(meta.label, locale)}
                </DialogTitle>
                <DialogDescription className="text-muted-foreground truncate text-xs">
                  {doc
                    ? localized(doc.summary, locale)
                    : t(locale, 'gallery.liveNote')}
                </DialogDescription>
              </div>
            </div>
            <span className="flex shrink-0 items-center gap-3">
              <SchemeSwitch />
              <span className="text-muted-foreground font-mono text-xs tabular-nums">
                {position.index + 1} / {position.total}
              </span>
              <StepButtons
                onStep={onStep}
                className="border-core-link/30 text-core-link hover:bg-core-link/10 rounded-md border p-1 transition-colors"
              />
              <DialogClose
                aria-label={t(locale, 'gallery.close')}
                className="border-core-link/30 text-core-link hover:bg-core-link/10 rounded-md border p-1 transition-colors"
              >
                <XIcon className="size-4" />
              </DialogClose>
            </span>
          </DialogHeader>
          <div className="bg-core-background-content flex-1 overflow-auto px-6 py-10 sm:px-10 sm:py-12">
            {preview}
          </div>
        </DialogContent>
      </Dialog>

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
