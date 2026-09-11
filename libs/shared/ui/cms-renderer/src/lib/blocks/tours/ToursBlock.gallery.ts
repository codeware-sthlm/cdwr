import type {
  Tour,
  ToursBlock as ToursBlockProps
} from '@codeware/shared/util/payload-types';

import type { BlockGalleryDoc } from '../gallery-doc';
import { showcaseMedia } from '../gallery-media';

/** Paired with the example block's id, the way a page pairs its own fetch. */
const ID = 'gallery-tours';

const tour = (
  id: number,
  slug: string,
  destination: string,
  title: string,
  summary: string,
  departureDate: string,
  duration: string,
  price: number,
  image: string,
  alt: string
): Tour =>
  ({
    id,
    slug,
    destination,
    title,
    summary,
    departureDate,
    duration,
    price,
    currency: 'SEK',
    heroImage: {
      relationTo: 'media',
      value: showcaseMedia(image, alt, 1264, 848)
    }
  }) as unknown as Tour;

export const toursGallery: BlockGalleryDoc<ToursBlockProps> = {
  name: {
    en: 'What is coming up',
    sv: 'Det som är på gång'
  },
  summary: {
    en: 'The latest tours, newest first.',
    sv: 'De senaste turerna, nyast först.'
  },
  whenToUse: {
    en: 'On a page that should end with what is new rather than with a claim. The heading and the count are the editor\u2019s; the entries themselves are fetched for the page when it is served, so the list is never edited and never out of date.',
    sv: 'På en sida som ska sluta med det senaste i stället för med ett påstående. Rubriken och antalet bestämmer redaktören; turerna hämtas för sidan när den levereras, så listan redigeras aldrig och blir aldrig inaktuell.'
  },
  example: {
    blockType: 'tours',
    id: ID,
    title: 'Departures',
    description: 'Trips with places left, soonest first.',
    limit: 3
  },
  exampleData: {
    tours: {
      [ID]: [
        tour(
          1,
          'ridge-light',
          'Dolomites',
          'Ridge light',
          'Four days along the high traverse, sleeping in huts and walking out at first light while the rock is still pink.',
          '2026-09-18T06:00:00.000Z',
          '4 days',
          12400,
          'hero.jpg',
          'Layered rock lit from within'
        ),
        tour(
          2,
          'salt-and-slow-water',
          'Bohuslan',
          'Salt and slow water',
          'A week of short crossings between islands, with an afternoon on every one of them and nothing booked after five.',
          '2026-10-02T06:00:00.000Z',
          '7 days',
          9800,
          'media.jpg',
          'Backlit woven steel mesh'
        ),
        tour(
          3,
          'the-long-way-north',
          'Lofoten',
          'The long way north',
          'Late departures for the light rather than the weather, ending each day where the road runs out.',
          '2026-11-06T06:00:00.000Z',
          '5 days',
          14200,
          'callout.jpg',
          'A curved sheet catching cold light'
        )
      ]
    }
  }
};
