import type { SupportedLocale } from '@codeware/shared/util/i18n';
import type { Page } from '@codeware/shared/util/payload-types';

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
export type BlockGalleryDoc<TExample = BlockExample> = {
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
  /** A real instance, rendered through the same renderer a page uses */
  example: TExample;
};

/**
 * Pick the text for the locale the site is rendering in.
 *
 * `PayloadValue.locale` is a plain string — a tenant may be configured with a
 * locale the platform has no translations for — so it is narrowed here rather
 * than asserted at each call site, falling back the way `t()` does.
 */
export function localized(text: LocalizedText, locale: string): string {
  return locale in text ? text[locale as SupportedLocale] : text.en;
}
