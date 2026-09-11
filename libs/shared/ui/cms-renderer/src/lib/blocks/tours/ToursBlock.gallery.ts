import type { BlockGalleryDocWithoutExample } from '../gallery-doc';

export const toursGallery: BlockGalleryDocWithoutExample = {
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
  exampleUnavailable: {
    en: 'The block holds a heading and a number, not the tours themselves — the page fetches those when it is served. The gallery is not that page, so there is nothing to list here.',
    sv: 'Blocket innehåller en rubrik och ett antal, inte själva turerna — dem hämtar sidan när den levereras. Galleriet är inte den sidan, så här finns inga turer att lista.'
  }
};
