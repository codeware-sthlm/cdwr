import type { CardBlock as CardBlockProps } from '@codeware/shared/util/payload-types';

import type { BlockGalleryDoc } from '../gallery-doc';

export const cardGallery: BlockGalleryDoc<CardBlockProps> = {
  name: {
    en: 'A grid of linked cards',
    sv: 'Ett rutnät av länkade kort'
  },
  summary: {
    en: 'A grid of cards with no heading of its own, usually linked.',
    sv: 'Ett rutnät med kort utan egen rubrik, oftast länkade.'
  },
  whenToUse: {
    en: 'Below a heading or a text that introduces the cards, such as a list of services or articles that each link to a page of their own. The block has no heading, so use Feature cards when the group needs one. The whole card looks clickable, so a card without a link can mislead the reader.',
    sv: 'Under en rubrik eller en text som presenterar korten, till exempel tjänster eller artiklar som var och en länkar till en egen sida. Blocket har ingen rubrik, så välj Funktionskort när gruppen behöver en. Hela kortet ser klickbart ut, så ett kort utan länk kan vilseleda läsaren.'
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
