import type { SpacingBlock as SpacingBlockProps } from '@codeware/shared/util/payload-types';

import type { BlockGalleryDoc } from '../gallery-doc';

export const spacingGallery: BlockGalleryDoc<SpacingBlockProps> = {
  name: {
    en: 'Deliberate air',
    sv: 'Medvetet mellanrum'
  },
  summary: {
    en: 'Space between two blocks, with an optional rule through it.',
    sv: 'Utrymme mellan två block, med en valfri linje igenom.'
  },
  whenToUse: {
    en: 'When two blocks need more distance than the page gives them by default, or when a rule should mark where one section ends and the next begins. Without a divider it is invisible by design — the example below turns one on so there is something to see.',
    sv: 'När två block behöver mer avstånd än sidan ger dem som standard, eller när en linje ska markera var ett avsnitt slutar och nästa börjar. Utan linje syns det ingenting, helt enligt avsikten — exemplet nedan har en påslagen så att det finns något att se.'
  },
  example: { blockType: 'spacing', size: 'regular', divider: true }
};
