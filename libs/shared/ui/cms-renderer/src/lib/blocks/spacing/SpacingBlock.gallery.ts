import type { SpacingBlock as SpacingBlockProps } from '@codeware/shared/util/payload-types';

import type { BlockGalleryDoc } from '../gallery-doc';

export const spacingGallery: BlockGalleryDoc<SpacingBlockProps> = {
  summary: {
    en: 'Space between two blocks, with an optional line through it.',
    sv: 'Utrymme mellan två block, med en valfri linje igenom.'
  },
  whenToUse: {
    en: 'When two blocks need more space between them than the page gives by default, or when a line should mark where one section ends and the next begins. Without the line the block is only empty space, so the example below shows the line.',
    sv: 'När två block behöver mer avstånd än sidan ger som standard, eller när en linje ska markera var ett avsnitt slutar och nästa börjar. Utan linjen är blocket bara tomrum, så exemplet nedan visar linjen.'
  },
  example: { blockType: 'spacing', size: 'regular', divider: true }
};
