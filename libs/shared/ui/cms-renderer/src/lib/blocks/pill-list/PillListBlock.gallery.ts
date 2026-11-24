import type { PillListBlock as PillListBlockProps } from '@codeware/shared/util/payload-types';

import type { BlockGalleryDoc } from '../gallery-doc';

export const pillListGallery: BlockGalleryDoc<PillListBlockProps> = {
  name: {
    en: 'A row of linked tags',
    sv: 'En rad med länkade etiketter'
  },
  summary: {
    en: 'Short labels in a row, linked where there is somewhere to go.',
    sv: 'Korta etiketter på rad, länkade där det finns något att gå till.'
  },
  whenToUse: {
    en: 'For a short list of names, such as packages, technologies or tags. Each label can link to a page of its own. All labels look the same, so the block suits names that need no explanation.',
    sv: 'För en kort lista med namn, till exempel paket, tekniker eller etiketter. Varje etikett kan länka till en egen sida. Alla etiketter ser likadana ut, så blocket passar för namn som inte behöver förklaras.'
  },
  example: {
    blockType: 'pill-list',
    eyebrow: 'Open Source',
    heading: 'Built in the open',
    intro: 'Our packages are published to npm and free to use.',
    band: 'strong',
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
        label: '@cdwr/fly-node',
        url: 'https://www.npmjs.com/package/@cdwr/fly-node'
      }
    ]
  }
};
