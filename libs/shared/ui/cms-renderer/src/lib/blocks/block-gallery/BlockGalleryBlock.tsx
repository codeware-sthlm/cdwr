'use client';

import { t } from '@codeware/shared/util/i18n';
import type {
  BlockGalleryBlock as BlockGalleryBlockProps,
  BlockSlug
} from '@codeware/shared/util/payload-types';
import {
  BLOCK_META,
  type BlockMeta
} from '@codeware/shared/util/payload-utils';
import { cn } from '@codeware/shared/util/ui';
import { useEffect, useRef, useState } from 'react';

import { usePayload } from '../../providers/PayloadProvider';
import { InlineText } from '../../utils/InlineText';
import { interactiveSurface } from '../../utils/interactive-surface';
import { type AnyBlockGalleryDoc, hasExample, localized } from '../gallery-doc';
import { galleryDocs } from '../gallery-docs';

import { BlockGalleryEntry, type RenderExample } from './BlockGalleryEntry';

/**
 * Blocks that are plumbing rather than a design choice.
 *
 * Listed for completeness and set apart: an editor reaching for `spacing` is
 * arranging the page, not deciding what it says. Not derivable from the
 * registry — it is a judgement about each block, so it is written down. The
 * union keeps a typo from inventing one.
 */
const structural = new Set<BlockSlug>([
  'content',
  'reusable-content',
  'spacing'
]);

/** Where the gallery itself is rendered, so it never lists itself. */
const self: BlockSlug = 'block-gallery';

/**
 * Blocks never drawn as a thumbnail: `theme-studio` pulls a heavy lazy chunk,
 * fonts and token parsing, and `form` repeats input ids and labels per card.
 */
const noThumbnail = new Set<BlockSlug>(['theme-studio', 'form']);

/**
 * True once the element has come within `margin` of the viewport, and stays
 * true. Never true on the server; without an observer it is true at once.
 */
function useNearViewport<T extends Element>(margin = '200px') {
  const ref = useRef<T>(null);
  const [near, setNear] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      setNear(true);
      return;
    }
    const observer = new IntersectionObserver(
      (hits) => {
        if (hits.some((hit) => hit.isIntersecting)) {
          setNear(true);
          observer.disconnect();
        }
      },
      { rootMargin: margin }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [margin]);

  return [ref, near] as const;
}

/** What a card shows below its text; unset is the illustration */
type CardPicture = NonNullable<BlockGalleryBlockProps['cardPicture']>;

type Entry = {
  meta: BlockMeta;
  doc?: AnyBlockGalleryDoc;
};

/**
 * One card: the slug an editor sees in the layout builder, then the name, then
 * the block drawn small.
 *
 * The card is the `li`; the button is stretched across it. The drawing can
 * hold links and buttons of its own, and those cannot sit inside a `button`.
 */
function BlockCard({
  meta,
  doc,
  picture,
  render: RenderExample,
  onOpen
}: Entry & {
  picture: CardPicture;
  render?: RenderExample;
  onOpen: () => void;
}) {
  const { locale } = usePayload();
  const example =
    picture === 'block' && doc && hasExample(doc) && !noThumbnail.has(meta.slug)
      ? doc
      : null;
  const [frame, near] = useNearViewport<HTMLDivElement>();

  return (
    <li
      className={cn(
        'relative flex h-full flex-col gap-2.5 rounded-xl p-5',
        interactiveSurface()
      )}
    >
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full flex-col gap-2.5 text-left outline-none after:absolute after:inset-0 after:rounded-xl after:content-['']"
      >
        <code className="text-core-link font-mono text-xs">{meta.slug}</code>
        <p className="text-foreground text-base font-semibold tracking-tight">
          {doc?.name
            ? localized(doc.name, locale)
            : localized(meta.label, locale)}
        </p>
        {/* Two ways to be outside the grid, and they are not the same news:
            nobody has written it up, or nothing offers it to an editor. One
            message for both makes an unoffered block look merely neglected */}
        <p
          className={cn(
            'text-muted-foreground text-sm leading-relaxed',
            !doc && 'italic'
          )}
        >
          {doc
            ? localized(doc.summary, locale)
            : t(
                locale,
                meta.availableIn.length === 0
                  ? 'gallery.notOffered'
                  : 'gallery.undocumented'
              )}
        </p>
      </button>
      {/* The admin picker's own image, so the two cannot drift apart. The cms
          serves it from public/blocks */}
      {picture === 'illustration' && (
        <img
          src={`/blocks/${meta.slug}.svg`}
          alt=""
          loading="lazy"
          className="bg-core-background-content mt-auto h-40 w-full rounded-lg border object-contain p-4"
        />
      )}
      {/* A picture, not a control: inert and hidden from assistive tech, the
          button above carries the card. `zoom` shrinks the drawing and the
          room it takes, so the block lays out as on a wide page */}
      {example?.example && RenderExample && (
        <div
          ref={frame}
          aria-hidden
          inert
          className="bg-core-background-content pointer-events-none mt-auto h-40 overflow-hidden rounded-lg border"
        >
          {/* Mounted on the client, once the card is near the screen: the
              server HTML carries the empty frame only */}
          {near && (
            <div data-testid="block-thumbnail" className="[zoom:0.35]">
              <RenderExample
                blocks={[example.example]}
                blocksData={example.exampleData}
                preview
              />
            </div>
          )}
        </div>
      )}
    </li>
  );
}

function Section({
  title,
  note,
  entries,
  picture,
  render,
  onOpen
}: {
  title: string;
  note?: string;
  entries: Array<Entry>;
  picture: CardPicture;
  render?: RenderExample;
  onOpen: (slug: BlockSlug) => void;
}) {
  if (entries.length === 0) {
    return null;
  }

  return (
    <section className="mt-12">
      <h3 className="text-foreground text-sm font-semibold tracking-tight">
        {title}
      </h3>
      {note && (
        <p className="text-muted-foreground mt-1.5 max-w-2xl text-sm leading-relaxed">
          {note}
        </p>
      )}
      <ul className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {entries.map((entry) => (
          <BlockCard
            key={entry.meta.slug}
            {...entry}
            picture={picture}
            render={render}
            onOpen={() => onOpen(entry.meta.slug)}
          />
        ))}
      </ul>
    </section>
  );
}

/**
 * Block gallery — the index.
 *
 * Reads the generated registry for what exists and the gallery modules for
 * what to say, so the two cannot disagree: a block with a renderer but no
 * write-up lands in its own section rather than going missing, which is what
 * stops the gallery quietly falling behind the library.
 */
export const BlockGalleryBlock: React.FC<
  BlockGalleryBlockProps & { render?: RenderExample }
> = ({ eyebrow, heading, intro, mode, cardPicture, render }) => {
  const { getSearchParam, locale } = usePayload();
  const picture = cardPicture ?? 'illustration';

  // Sorted by the name actually shown, not the registered label — an
  // editorial name meant the cards read in one order and the stepper walked
  // them in another
  const shownAs = ({ meta, doc }: Entry) =>
    doc?.name ? localized(doc.name, locale) : localized(meta.label, locale);

  const entries: Array<Entry> = Object.values(BLOCK_META)
    .filter(({ slug }) => slug !== self)
    .map((meta) => ({ meta, doc: galleryDocs[meta.slug] }))
    .sort((a, b) => shownAs(a).localeCompare(shownAs(b), locale));

  // A block an editor can reach for on a page, and that someone has explained
  const design = entries.filter(
    ({ meta, doc }) =>
      doc && !structural.has(meta.slug) && meta.availableIn.includes('pages')
  );
  const plumbing = entries.filter(
    ({ meta, doc }) => doc && structural.has(meta.slug)
  );
  // Both halves of "not in the grid": no write-up, or nowhere to place it
  // Structural blocks have a row of their own, so a documented one offered
  // only by `reusable-content` or `content` belongs there rather than in both
  const pending = entries.filter(
    ({ meta, doc }) =>
      !doc ||
      (!structural.has(meta.slug) && !meta.availableIn.includes('pages'))
  );

  const documented = entries.length - entries.filter(({ doc }) => !doc).length;

  // `?block=hero` arrives at one entry without giving the gallery a route.
  // Read once, as the opening view — the stepper deliberately does not write
  // back, since twenty-one history entries is worse than a link that points
  // at where the visitor started.
  const requested = getSearchParam('block');
  const opening = (): BlockSlug | null => {
    const match = entries.find(({ meta }) => meta.slug === requested);
    if (match) return match.meta.slug;
    if (mode !== 'browser') return null;
    // The first block with something to show, not simply the first block —
    // opening on an undocumented one makes the view look broken
    const first = entries.find(({ doc }) => doc) ?? entries[0];
    return first?.meta.slug ?? null;
  };
  const [selected, setSelected] = useState(opening);
  // Up here rather than in the entry, so the way back to the list closes it
  const [expanded, setExpanded] = useState(false);

  // `RenderBlocks` keys by position, so a navigation that leaves the gallery
  // at the same index keeps this instance and its selection. Open again
  // whenever what it was asked to open changes — a link to another `?block=`
  // on the same page included
  const openedFor = `${mode}:${requested ?? ''}`;
  const [lastOpenedFor, setLastOpenedFor] = useState(openedFor);
  if (lastOpenedFor !== openedFor) {
    setLastOpenedFor(openedFor);
    setSelected(opening());
  }

  const current = entries.findIndex(({ meta }) => meta.slug === selected);

  if (current >= 0) {
    const entry = entries[current];

    return (
      <section>
        {/* Not keyed by block: a remount per step closed and reopened the
            full screen dialog, which flashed. The band choice carries over */}
        <BlockGalleryEntry
          meta={entry.meta}
          doc={entry.doc}
          render={render}
          expanded={expanded}
          onExpandedChange={setExpanded}
          onBack={() => {
            setExpanded(false);
            setSelected(null);
          }}
          // Wraps rather than disabling at the ends: a stepper that stops is a
          // dead control two clicks into a gallery meant to be flicked through
          onStep={(delta) =>
            setSelected(
              entries[(current + delta + entries.length) % entries.length].meta
                .slug
            )
          }
          position={{ index: current, total: entries.length }}
        />
      </section>
    );
  }

  return (
    <section>
      <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl">
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
              <InlineText text={intro} />
            </p>
          )}
        </div>

        {/* Counted from the registry, so the numbers cannot be stale */}
        <dl className="flex shrink-0 gap-8">
          {[
            {
              value: entries.length,
              label: t(locale, 'gallery.registered')
            },
            { value: documented, label: t(locale, 'gallery.documented') }
          ].map(({ value, label }) => (
            <div key={label} className="flex flex-col">
              <dt className="sr-only">{label}</dt>
              <dd className="text-core-headline text-3xl font-semibold tracking-tight">
                {value}
              </dd>
              <span
                aria-hidden
                className="text-muted-foreground mt-1 text-xs tracking-[0.12em] uppercase"
              >
                {label}
              </span>
            </div>
          ))}
        </dl>
      </div>

      <Section
        title={t(locale, 'gallery.contentBlocks')}
        entries={design}
        picture={picture}
        render={render}
        onOpen={setSelected}
      />
      <Section
        title={t(locale, 'gallery.structural')}
        note={t(locale, 'gallery.structuralNote')}
        entries={plumbing}
        picture={picture}
        render={render}
        onOpen={setSelected}
      />
      <Section
        title={t(locale, 'gallery.pending')}
        note={t(locale, 'gallery.pendingNote')}
        entries={pending}
        picture={picture}
        render={render}
        onOpen={setSelected}
      />
    </section>
  );
};
