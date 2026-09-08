import type { HeroBlock as HeroBlockProps } from '@codeware/shared/util/payload-types';

import type { BlockGalleryDoc } from '../gallery-doc';

export const heroGallery: BlockGalleryDoc<HeroBlockProps> = {
  name: {
    en: 'The opening claim',
    sv: 'Sidans öppning'
  },
  summary: {
    en: 'The first thing on a page: one headline, one sentence, and up to two actions.',
    sv: 'Det första på sidan: en rubrik, en mening och upp till två knappar.'
  },
  whenToUse: {
    en: 'At the top of a page that has something to claim. The headline carries the claim, the sentence below makes it understandable, and the actions give the reader somewhere to go. One per page — a second hero means neither reads as the beginning.',
    sv: 'Överst på en sida som har något att hävda. Rubriken bär påståendet, meningen under gör det begripligt och knapparna ger läsaren någonstans att ta vägen. Ett per sida — ett andra gör att inget av dem uppfattas som början.'
  },
  example: {
    blockType: 'hero',
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
