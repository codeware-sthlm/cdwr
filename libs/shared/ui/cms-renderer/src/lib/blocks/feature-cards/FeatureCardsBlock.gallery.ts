import type { FeatureCardsBlock as FeatureCardsBlockProps } from '@codeware/shared/util/payload-types';

import type { BlockGalleryDoc } from '../gallery-doc';

export const featureCardsGallery: BlockGalleryDoc<FeatureCardsBlockProps> = {
  summary: {
    en: 'A heading above three or four cards, each with an icon and a sentence.',
    sv: 'En rubrik över tre eller fyra kort, vart och ett med en ikon och en mening.'
  },
  whenToUse: {
    en: 'For three or four things of equal importance, such as what a service includes. The cards sit under the block\u2019s own heading; use the Card block when the heading is already on the page. With five or more cards the row wraps and the last ones end up on a line of their own.',
    sv: 'För tre eller fyra saker som är lika viktiga, till exempel vad en tjänst innehåller. Blocket har en egen rubrik ovanför korten; välj blocket Kort när rubriken redan finns på sidan. Med fem eller fler kort bryts raden och de sista hamnar på en egen rad.'
  },
  example: {
    blockType: 'feature-cards',
    eyebrow: 'Capabilities',
    heading: 'What we do',
    intro:
      'From product strategy to production-grade systems — we handle the full stack.',
    columns: 'auto',
    items: [
      {
        brand: { icon: 'CodeBracketIcon', color: undefined },
        title: 'Engineering',
        description:
          'Full-stack development with modern tooling, type-safe APIs and clean architecture.'
      },
      {
        brand: { icon: 'CpuChipIcon', color: undefined },
        title: 'Platform',
        description:
          'CI/CD, infrastructure as code and cloud-native deployments that just work.'
      },
      {
        brand: { icon: 'SparklesIcon', color: undefined },
        title: 'Design',
        description:
          'Component libraries, design systems and accessible interfaces built to scale.'
      }
    ]
  }
};
