import type { FeatureCardsBlock as FeatureCardsBlockProps } from '@codeware/shared/util/payload-types';

import type { BlockGalleryDoc } from '../gallery-doc';

export const featureCardsGallery: BlockGalleryDoc<FeatureCardsBlockProps> = {
  name: {
    en: 'Claims of equal weight',
    sv: 'Påståenden med samma tyngd'
  },
  summary: {
    en: 'Three or four claims of equal weight, each with an icon and a sentence.',
    sv: 'Tre eller fyra påståenden med samma tyngd, var och en med en ikon och en mening.'
  },
  whenToUse: {
    en: 'When the things are genuinely parallel — same weight, same shape, no order between them. The grid says these are peers and a reader believes it. Five is where it breaks: the row wraps and the last two read as an afterthought.',
    sv: 'När sakerna verkligen är jämbördiga — samma tyngd, samma form, ingen inbördes ordning. Rutnätet säger att de hör ihop som likar, och läsaren tror på det. Vid fem slutar det fungera: raden bryts och de två sista uppfattas som eftertankar.'
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
