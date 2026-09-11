import type { SupportedLocale } from '@codeware/shared/util/i18n';
import type { Page } from '@codeware/shared/util/payload-types';
import type { BlocksData } from '@codeware/shared/util/payload-utils';

/**
 * A string the gallery shows a visitor, in every locale the platform serves.
 *
 * Derived from `SupportedLocale` rather than spelling the pair out, so adding
 * a third locale stops every gallery module compiling until it is answered
 * for — which is the point of writing these as source.
 */
export type LocalizedText = Record<SupportedLocale, string>;

/**
 * A block instance as the renderer receives it.
 *
 * Exactly what `RenderBlocks` accepts, so an example cannot be documented in a
 * shape the gallery could not draw. A block absent from every layout — `video`
 * today — is therefore outside this union: it can be listed and described, but
 * it has nowhere to be rendered from, which is the same thing the admin says
 * about it.
 */
export type BlockExample = NonNullable<Page['layout']>[number];

/**
 * What to say about one block, and one real instance of it.
 *
 * Source, not content. A block is designed for a purpose and that purpose is
 * the same in every workspace — asking each tenant to retype it would leave
 * the first one who skipped it with an empty styleguide. What a tenant *does*
 * own is the rendering: their theme, their colours.
 *
 * The example is the same object the block's story renders, imported by both,
 * so the gallery cannot drift from what Chromatic has been reviewing.
 */
type BlockGalleryProse = {
  /**
   * What to call the block, when its registered label is not worth reading.
   *
   * `labels.singular` is almost always the slug with a capital and a space —
   * `feature-section` becomes "Feature section" — so a heading built from it
   * restates the slug beside it and earns nothing. Optional: a block whose
   * label already says something ("Callout") does not need a second name, and
   * the admin's own wording is the honest default.
   */
  name?: LocalizedText;
  /** One line for the gallery card. What the block is, not what it is good at */
  summary: LocalizedText;
  /**
   * What the block is for and where it belongs on a page.
   *
   * One paragraph carrying purpose and placement. An earlier draft had a
   * second field naming the neighbouring block to reach for instead — dropped
   * as hard to write honestly twenty-one times, and thin when forced.
   */
  whenToUse: LocalizedText;
};

/** A documented block with a real instance to draw. */
export type BlockGalleryDoc<TExample = BlockExample> = BlockGalleryProse & {
  /** Rendered through the same renderer a page uses */
  example: TExample;
  /**
   * What the page would have handed a listing block.
   *
   * `posts` and `tours` carry a heading and a count; the documents behind them
   * are fetched for the page as it is served. The gallery has no such page, so
   * it brings its own — otherwise the block draws nothing and the entry has to
   * describe itself instead of showing itself.
   */
  exampleData?: BlocksData;
};

/**
 * Pick the text for the locale the site is rendering in.
 *
 * `PayloadValue.locale` is a plain string — a tenant may be configured with a
 * locale the platform has no translations for — so it is narrowed here rather
 * than asserted at each call site, falling back the way `t()` does.
 */
export function localized(
  text: LocalizedText | Record<string, string>,
  locale: string
): string {
  // Own keys only: `in` would also answer for `toString` and friends
  const written = text as Record<string, string>;
  return Object.hasOwn(written, locale)
    ? written[locale]
    : (written['en'] ?? '');
}
