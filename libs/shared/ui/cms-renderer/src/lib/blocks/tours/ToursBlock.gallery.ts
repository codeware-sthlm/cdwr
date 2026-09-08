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
    sv: 'På en sida som ska sluta med det senaste i stället för med ett påstående. Rubriken och antalet bestämmer redaktören; posterna hämtas för sidan när den levereras, så listan redigeras aldrig och blir aldrig inaktuell.'
  },
  exampleUnavailable: {
    en: 'This block is filled from the page it sits on, and renders nothing without those documents \u2014 so there is nothing to show here.',
    sv: 'Blocket fylls från sidan det sitter på och visar ingenting utan de dokumenten \u2014 alltså finns det inget att visa här.'
  }
};
