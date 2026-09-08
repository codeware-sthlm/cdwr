import type { BlockGalleryDocWithoutExample } from '../gallery-doc';

export const reusableContentGallery: BlockGalleryDocWithoutExample = {
  name: {
    en: 'Written once, placed anywhere',
    sv: 'Skrivet en gång, placerat var som helst'
  },
  summary: {
    en: 'A fragment authored in one place and referenced from many.',
    sv: 'Ett avsnitt som skrivs på ett ställe och refereras från flera.'
  },
  whenToUse: {
    en: 'When the same content belongs on several pages and should only be edited once — an office address, a standard disclaimer, a contact panel. It holds its own blocks, so what is reused can be a whole section rather than a paragraph.',
    sv: 'När samma innehåll hör hemma på flera sidor och bara ska redigeras på ett ställe — en besöksadress, en standardformulering, en kontaktruta. Det innehåller egna block, så det som återanvänds kan vara ett helt avsnitt och inte bara ett stycke.'
  },
  exampleUnavailable: {
    en: 'The block points at a reusable content document, which has to exist before there is anything to draw.',
    sv: 'Blocket pekar på ett dokument med återanvändbart innehåll, som måste finnas innan det finns något att rita upp.'
  }
};
