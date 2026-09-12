import type { FeatureSectionBlock as FeatureSectionBlockProps } from '@codeware/shared/util/payload-types';

import type { BlockGalleryDoc } from '../gallery-doc';
import { showcaseMedia } from '../gallery-media';

export const featureSectionGallery: BlockGalleryDoc<FeatureSectionBlockProps> =
  {
    name: {
      en: 'A claim with its evidence',
      sv: 'Ett påstående och beläggen för det'
    },
    summary: {
      en: 'One claim, one visual, and the supporting points beneath it.',
      sv: 'Ett påstående, en bild och de stödjande punkterna nedanför.'
    },
    whenToUse: {
      en: 'The workhorse of a long marketing page, repeated down it. Use it when a single claim deserves a visual that makes it checkable, with two to four points that qualify it rather than compete with it.',
      sv: 'Det block som gör grovjobbet på en lång säljsida, upprepat hela vägen ner. Använd det när ett enskilt påstående förtjänar en bild som gör det möjligt att se att det stämmer, med två till fyra punkter som preciserar påståendet snarare än konkurrerar med det.'
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
