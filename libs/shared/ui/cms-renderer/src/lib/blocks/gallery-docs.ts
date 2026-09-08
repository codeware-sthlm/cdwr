import type { BlockSlug } from '@codeware/shared/util/payload-types';

import { featureSectionGallery } from './feature-section/FeatureSectionBlock.gallery';
import type { BlockExample, BlockGalleryDoc } from './gallery-doc';
import { testimonialGallery } from './testimonial/TestimonialBlock.gallery';

/**
 * What the gallery says about each block.
 *
 * `Partial` on purpose, and it is the one map here that is allowed to be
 * incomplete: a block with no entry is *undocumented*, which the gallery shows
 * as its own marked section rather than hiding. That is what stops the gallery
 * quietly falling behind — a block merged today appears the same day, unwritten
 * and visible, so the pressure to finish is public.
 *
 * The keys are still checked, so a typo cannot invent a block. What exists
 * comes from `BLOCK_META`, which is generated from the Payload registry.
 */
export const galleryDocs: Partial<
  Record<BlockSlug, BlockGalleryDoc<BlockExample>>
> = {
  'feature-section': featureSectionGallery,
  testimonial: testimonialGallery
};
