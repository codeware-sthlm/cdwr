import type { ShowcaseBlock as ShowcaseBlockProps } from '@codeware/shared/util/payload-types';

import type { BlockGalleryDoc } from '../gallery-doc';

export const showcaseGallery: BlockGalleryDoc<ShowcaseBlockProps> = {
  summary: {
    en: 'Items in rows, each with a tag, a paragraph and a link.',
    sv: 'Poster i rader, var och en med en etikett, ett stycke och en länk.'
  },
  whenToUse: {
    en: 'For presenting work one item at a time, such as projects, case studies or packages. Each row has room for a sentence about the item and a line of technical detail, which is more than a card has room for.',
    sv: 'För att presentera arbeten ett i taget, till exempel projekt, kundcase eller paket. Varje rad har plats för en mening om arbetet och en rad med tekniska detaljer, vilket är mer än ett kort rymmer.'
  },
  example: {
    blockType: 'showcase',
    eyebrow: 'Selected Work',
    heading: 'What we have shipped',
    intro:
      'A selection of products and platforms we have designed and engineered.',
    enableHeaderLink: true,
    link: {
      type: 'custom',
      url: '/work',
      label: 'All projects',
      newTab: false
    },
    items: [
      {
        tag: 'Platform',
        title: 'Codeware Dev',
        description:
          'Multi-tenant CMS platform built on Payload CMS, Next.js and Nx. Powers content for multiple brands from a single deployment.',
        meta: 'Nx · Payload · Postgres · Next.js · Fly.io',
        link: {
          type: 'custom',
          url: '/work/codeware-dev',
          label: 'View case study',
          newTab: false
        }
      },
      {
        tag: 'Open Source',
        title: 'nx-payload',
        description:
          'Nx plugin that integrates Payload CMS into any Nx workspace with generators, executors and type-safe configuration.',
        meta: 'Nx · TypeScript · npm',
        link: {
          type: 'custom',
          url: 'https://github.com/codeware-sthlm/nx-payload',
          label: 'View on GitHub',
          newTab: true
        }
      }
    ]
  }
};
