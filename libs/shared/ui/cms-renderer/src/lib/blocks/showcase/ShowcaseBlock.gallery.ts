import type { ShowcaseBlock as ShowcaseBlockProps } from '@codeware/shared/util/payload-types';

import type { BlockGalleryDoc } from '../gallery-doc';

export const showcaseGallery: BlockGalleryDoc<ShowcaseBlockProps> = {
  name: {
    en: 'Work worth naming one at a time',
    sv: 'Arbeten värda att nämna ett i taget'
  },
  summary: {
    en: 'Peer items in rows, each with a tag, a paragraph and a link.',
    sv: 'Jämbördiga poster i rader, var och en med en etikett, ett stycke och en länk.'
  },
  whenToUse: {
    en: 'For work that deserves naming individually — projects, case studies, packages. Each row has room for a sentence about what the thing was and a line of technical detail, which a grid of cards cannot give it.',
    sv: 'För arbeten som förtjänar att nämnas var för sig — projekt, kundcase, paket. Varje rad har plats för en mening om vad saken var och en rad teknisk detalj, vilket ett rutnät med kort inte kan ge den.'
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
