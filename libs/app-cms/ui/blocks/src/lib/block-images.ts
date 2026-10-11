import type { BlockSlug } from '@codeware/shared/util/payload-types';
import type { Block } from 'payload';

/**
 * The picture and icon of a block in the admin's block picker.
 *
 * An `<img>` loads them from `public/blocks`, where `nx sync`
 * (block-images-sync) writes the files.
 */
export const blockImages = (slug: BlockSlug, alt: string) =>
  ({
    thumbnail: { url: `/blocks/${slug}.svg`, alt },
    icon: `/blocks/${slug}.icon.svg`
  }) satisfies NonNullable<Block['admin']>['images'];
