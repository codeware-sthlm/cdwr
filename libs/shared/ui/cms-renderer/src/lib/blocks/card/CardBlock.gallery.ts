import type { CardBlock as CardBlockProps } from '@codeware/shared/util/payload-types';

import type { BlockGalleryDoc } from '../gallery-doc';

export const cardGallery: BlockGalleryDoc<CardBlockProps> = {
  name: {
    en: 'Things that lead somewhere',
    sv: 'Poster som leder vidare'
  },
  summary: {
    en: 'A grid of items, each one a door.',
    sv: 'Ett rutnät med poster där var och en är en ingång.'
  },
  whenToUse: {
    en: 'When every item leads somewhere — a service, a section, a document. The whole card is the target, so an item with nowhere to go leaves a card that looks clickable and is not.',
    sv: 'När varje post leder någonstans — en tjänst, en sektion, ett dokument. Hela kortet är klickytan, så en post utan mål ger ett kort som ser klickbart ut men inte är det.'
  },
  example: {
    blockType: 'card',
    cards: [
      {
        brand: { icon: 'CodeBracketIcon', color: undefined },
        title: 'Engineering',
        description: 'Type-safe APIs and clean architecture.',
        content:
          'Full-stack development with modern tooling and proven patterns.',
        enableLink: true,
        link: {
          type: 'custom',
          url: '/services/engineering',
          label: 'Learn more',
          newTab: false,
          navTrigger: 'link'
        }
      },
      {
        brand: { icon: 'CpuChipIcon', color: undefined },
        title: 'Platform',
        description: 'Cloud-native deployments that just work.',
        content: 'CI/CD pipelines and infrastructure as code.',
        enableLink: true,
        link: {
          type: 'custom',
          url: '/services/platform',
          label: 'Learn more',
          newTab: false,
          navTrigger: 'link'
        }
      },
      {
        brand: { icon: 'SparklesIcon', color: undefined },
        title: 'Design Systems',
        description: 'Component libraries built to scale.',
        content: 'Accessible interfaces and coherent design tokens.',
        enableLink: true,
        link: {
          type: 'custom',
          url: '/services/design',
          label: 'Learn more',
          newTab: false,
          navTrigger: 'link'
        }
      }
    ]
  }
};
