import type { CardBlock as CardBlockProps } from '@codeware/shared/util/payload-types';

import type { BlockGalleryDoc } from '../gallery-doc';

export const cardGallery: BlockGalleryDoc<CardBlockProps> = {
  name: {
    en: 'Support for the claim above it',
    sv: 'Stöd för påståendet ovanför'
  },
  summary: {
    en: 'A grid of cards with no heading of its own, usually linked.',
    sv: 'Ett rutnät med kort utan egen rubrik, oftast länkade.'
  },
  whenToUse: {
    en: 'After a block that has already made the claim: the cards carry the detail and usually link on. Having no heading of its own is what separates it from feature-cards, which states its own claim and lets its cards support that. The whole card is the target, so a card with nowhere to go looks clickable and is not.',
    sv: 'Efter ett block som redan gjort påståendet: korten bär detaljerna och länkar oftast vidare. Att det saknar egen rubrik är det som skiljer det från feature-cards, som gör sitt eget påstående och låter korten stötta just det. Hela kortet är klickytan, så ett kort utan mål ser klickbart ut men är det inte.'
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
