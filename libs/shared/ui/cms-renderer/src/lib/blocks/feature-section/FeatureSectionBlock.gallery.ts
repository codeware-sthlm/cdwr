import type { FeatureSectionBlock as FeatureSectionBlockProps } from '@codeware/shared/util/payload-types';

import type { BlockGalleryDoc } from '../gallery-doc';
import { showcaseMedia } from '../gallery-media';

export const featureSectionGallery: BlockGalleryDoc<FeatureSectionBlockProps> =
  {
    name: {
      en: 'A heading, a paragraph and a few points',
      sv: 'En rubrik, ett stycke och några punkter'
    },
    summary: {
      en: 'A heading, a text and an image, with a few points beneath them.',
      sv: 'En rubrik, en text och en bild, med några punkter under.'
    },
    whenToUse: {
      en: 'For explaining one feature or service with a picture, such as a screenshot or a diagram. Two to four points below the text give the details. On a long page the block can be repeated, one section per feature.',
      sv: 'För att förklara en funktion eller tjänst med hjälp av en bild, till exempel en skärmbild eller ett diagram. Två till fyra punkter under texten ger detaljerna. På en lång sida kan blocket upprepas, ett avsnitt per funktion.'
    },
    example: {
      blockType: 'feature-section',
      media: showcaseMedia(
        'feature-section.jpg',
        'A receding row of edge-lit acrylic panels',
        1376,
        768
      ),
      eyebrow: 'Per-tenant theming',
      heading: 'Change the theme. Nothing reloads.',
      intro:
        'A tenant picks its palette, its colour scheme, and whether visitors may switch at all. Authored in the admin, not in a stylesheet.',
      enableLink: true,
      link: {
        type: 'custom',
        label: 'Explore theming',
        url: '?block=hero',
        newTab: false
      },
      subFeatures: [
        {
          title: 'Selected in settings',
          body: 'A tenant with one theme gets no switcher. Several, and the control appears on its own.'
        },
        {
          title: 'Light, dark, or fixed',
          body: 'A site can be restricted to one scheme when the brand demands it.'
        },
        {
          title: 'Resolved on the server',
          body: 'The choice arrives with the HTML, so nothing flashes the wrong colour on first paint.'
        }
      ]
    }
  };
