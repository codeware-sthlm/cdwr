import type { HeroBlock as HeroBlockProps } from '@codeware/shared/util/payload-types';

import type { BlockGalleryDoc } from '../gallery-doc';
import { showcaseMedia } from '../gallery-media';

export const heroGallery: BlockGalleryDoc<HeroBlockProps> = {
  summary: {
    en: 'The top of a page: a headline, a short text and up to two buttons.',
    sv: 'Sidans topp: en rubrik, en kort text och upp till två knappar.'
  },
  whenToUse: {
    en: 'At the top of a page, to say what the page is about. The headline names the subject, the text below explains it in a sentence or two, and the buttons lead to the next step. Use one per page.',
    sv: 'Överst på en sida, för att säga vad sidan handlar om. Rubriken anger ämnet, texten under förklarar det med en eller två meningar och knapparna leder till nästa steg. Använd ett per sida.'
  },
  example: {
    blockType: 'hero',
    media: showcaseMedia(
      'hero.jpg',
      'A bundle of fibre-optic strands fanning out, each tip lit',
      1376,
      768
    ),
    badge: 'Codeware',
    heading: 'Build with the best.',
    lede: 'We design and engineer digital products that help ambitious companies move faster and scale smarter.',
    actions: [
      {
        link: {
          type: 'custom',
          url: '/contact',
          label: 'Get in touch',
          newTab: false
        },
        emphasis: 'primary'
      },
      {
        link: {
          type: 'custom',
          url: '/work',
          label: 'See our work',
          newTab: false
        },
        emphasis: 'secondary'
      }
    ]
  }
};
