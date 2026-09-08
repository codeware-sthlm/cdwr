import type { BlockGalleryDocWithoutExample } from '../gallery-doc';

export const formGallery: BlockGalleryDocWithoutExample = {
  name: {
    en: 'Messages that land in the admin',
    sv: 'Meddelanden som hamnar i administrationen'
  },
  summary: {
    en: 'A form built in the admin, with its fields and confirmation.',
    sv: 'Ett formulär byggt i administrationen, med sina fält och sin bekräftelse.'
  },
  whenToUse: {
    en: 'When the page needs an answer back. The fields are built once as a form document and referenced here, so the same form can sit on several pages, and every submission lands in the admin rather than with a third party.',
    sv: 'När sidan behöver ett svar tillbaka. Fälten byggs en gång som ett formulärdokument och refereras här, så samma formulär kan sitta på flera sidor, och varje inskickat svar hamnar i administrationen i stället för hos en tredje part.'
  },
  exampleUnavailable: {
    en: 'The block points at a form document, which has to exist before there is anything to draw.',
    sv: 'Blocket pekar på ett formulärdokument, som måste finnas innan det finns något att rita upp.'
  }
};
