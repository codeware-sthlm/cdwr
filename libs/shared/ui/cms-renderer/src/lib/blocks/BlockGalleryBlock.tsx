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

import { usePayload } from '../providers/PayloadProvider';

import { type BlockGalleryDoc, localized } from './gallery-doc';
import { galleryDocs } from './gallery-docs';

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

type Entry = {
  meta: BlockMeta;
  doc?: BlockGalleryDoc;
};

/** One card: the slug an editor sees in the layout builder, then the name. */
function BlockCard({ meta, doc }: Entry) {
  const { locale } = usePayload();

  return (
    <li className="border-border bg-card/50 flex flex-col gap-2.5 rounded-xl border p-5">
      <code className="text-core-link font-mono text-xs">{meta.slug}</code>
      <p className="text-foreground text-base font-semibold tracking-tight">
        {meta.label}
      </p>
      <p
        className={cn(
          'text-muted-foreground text-sm leading-relaxed',
          !doc && 'italic'
        )}
      >
        {doc
          ? localized(doc.summary, locale)
          : t(locale, 'gallery.undocumented')}
      </p>
    </li>
  );
}

function Section({
  title,
  note,
  entries
}: {
  title: string;
  note?: string;
  entries: Array<Entry>;
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
          <BlockCard key={entry.meta.slug} {...entry} />
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
export const BlockGalleryBlock: React.FC<BlockGalleryBlockProps> = ({
  eyebrow,
  heading,
  intro
}) => {
  const { locale } = usePayload();

  const entries: Array<Entry> = Object.values(BLOCK_META)
    .filter(({ slug }) => slug !== self)
    .map((meta) => ({ meta, doc: galleryDocs[meta.slug] }))
    .sort((a, b) => a.meta.label.localeCompare(b.meta.label));

  // A block an editor can reach for on a page, and that someone has explained
  const design = entries.filter(
    ({ meta, doc }) =>
      doc && !structural.has(meta.slug) && meta.availableIn.includes('pages')
  );
  const plumbing = entries.filter(
    ({ meta, doc }) => doc && structural.has(meta.slug)
  );
  // Both halves of "not in the grid": no write-up, or nowhere to place it
  const pending = entries.filter(
    ({ meta, doc }) => !doc || !meta.availableIn.includes('pages')
  );

  const documented = entries.length - entries.filter(({ doc }) => !doc).length;

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
              {intro}
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

      <Section title={t(locale, 'gallery.contentBlocks')} entries={design} />
      <Section
        title={t(locale, 'gallery.structural')}
        note={t(locale, 'gallery.structuralNote')}
        entries={plumbing}
      />
      <Section
        title={t(locale, 'gallery.pending')}
        note={t(locale, 'gallery.pendingNote')}
        entries={pending}
      />
    </section>
  );
};
