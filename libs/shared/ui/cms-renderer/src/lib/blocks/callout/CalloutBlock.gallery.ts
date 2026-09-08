import type { CalloutBlock as CalloutBlockProps } from '@codeware/shared/util/payload-types';

import type { BlockGalleryDoc } from '../gallery-doc';

export const calloutGallery: BlockGalleryDoc<CalloutBlockProps> = {
  name: {
    en: 'An ask, set into the page',
    sv: 'En uppmaning infälld i sidan'
  },
  summary: {
    en: 'Compact and centred: one heading, one sentence, one button.',
    sv: 'Kompakt och centrerad: en rubrik, en mening och en knapp.'
  },
  whenToUse: {
    en: 'Partway down a page, when the reader has seen enough to act but the page has not finished. One action only: a band with two buttons asks the reader to choose rather than to move.',
    sv: 'En bit ner på sidan, när läsaren sett tillräckligt för att kunna agera men sidan inte är slut. Bara en knapp: ett band med två knappar ber läsaren välja i stället för att gå vidare.'
  },
  example: {
    blockType: 'callout',
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
