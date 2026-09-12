import type { PillListBlock as PillListBlockProps } from '@codeware/shared/util/payload-types';

import type { BlockGalleryDoc } from '../gallery-doc';

export const pillListGallery: BlockGalleryDoc<PillListBlockProps> = {
  name: {
    en: 'A set, not an argument',
    sv: 'En uppsättning, inte ett argument'
  },
  summary: {
    en: 'Short labels in a row, linked where there is somewhere to go.',
    sv: 'Korta etiketter på rad, länkade där det finns något att gå till.'
  },
  whenToUse: {
    en: 'For names that belong together and need no explanation — packages, tags, capabilities. The list itself is the point: nothing here outranks anything else, and a pill has no room to argue.',
    sv: 'För namn som hör ihop och inte behöver förklaras — paket, etiketter, förmågor. Själva listan är poängen: inget här väger tyngre än något annat, och en etikett har inte plats att argumentera.'
  },
  example: {
    blockType: 'pill-list',
    eyebrow: 'Open Source',
    heading: 'Built in the open',
    intro: 'Our packages are published to npm and free to use.',
    surface: 'dark',
    items: [
      {
        label: '@cdwr/nx-payload',
        url: 'https://www.npmjs.com/package/@cdwr/nx-payload'
      },
      {
        label: '@cdwr/create-nx-payload',
        url: 'https://www.npmjs.com/package/@cdwr/create-nx-payload'
      },
      {
        label: '@cdwr/nx-ai',
        url: 'https://www.npmjs.com/package/@cdwr/nx-ai'
      },
      {
        label: '@cdwr/fly-node',
        url: 'https://www.npmjs.com/package/@cdwr/fly-node'
      }
    ]
  }
};
