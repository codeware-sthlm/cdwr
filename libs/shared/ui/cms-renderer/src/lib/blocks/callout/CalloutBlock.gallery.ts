import type { CalloutBlock as CalloutBlockProps } from '@codeware/shared/util/payload-types';

import type { BlockGalleryDoc } from '../gallery-doc';
import { showcaseMedia } from '../gallery-media';

export const calloutGallery: BlockGalleryDoc<CalloutBlockProps> = {
  summary: {
    en: 'A band with a heading, a short text and an optional button.',
    sv: 'Ett band med en rubrik, en kort text och en valfri knapp.'
  },
  whenToUse: {
    en: 'Partway down a page, to point the reader to a next step, such as booking a call or reading a guide. There is room for one button. An image or an illustration can sit beside the text.',
    sv: 'En bit ner på sidan, för att visa läsaren ett nästa steg, till exempel att boka ett samtal eller läsa en guide. Det finns plats för en knapp. En bild eller en illustration kan placeras bredvid texten.'
  },
  example: {
    blockType: 'callout',
    image: showcaseMedia(
      'callout.jpg',
      'A cluster of acrylic rods, each glowing at its cut top',
      1264,
      848
    ),
    showMark: true,
    heading: 'Ready to build something great?',
    body: 'Let us know what you are working on and we will figure out how to help.',
    link: {
      type: 'custom',
      url: '/contact',
      label: 'Get in touch',
      newTab: false
    }
  }
};
