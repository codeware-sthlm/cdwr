import type { ComingSoonBlock as ComingSoonBlockProps } from '@codeware/shared/util/payload-types';

import type { BlockGalleryDoc } from '../gallery-doc';

export const comingSoonGallery: BlockGalleryDoc<ComingSoonBlockProps> = {
  name: {
    en: 'A temporary landing page',
    sv: 'En tillfällig startsida'
  },
  summary: {
    en: 'A full-screen page for a site that is not open yet: a drawing, a heading, the opening date and a way to ask for a notice.',
    sv: 'En helskärmssida för en webbplats som inte har öppnat: en teckning, en rubrik, öppningsdatum och ett sätt att be om besked.'
  },
  whenToUse: {
    en: 'While the rest of the site is unfinished. Set this page as the landing page in the site settings. For the notify button, put a Form block set to Overlay with an anchor on the same page and enter that anchor in the block. The form stores its submissions and sends its own emails, but it does not mail visitors when the site opens. Take unfinished pages down with Unpublish: a draft saved over a published page keeps the published one live. The navigation then leaves them out for visitors.',
    sv: 'Medan resten av webbplatsen inte är klar. Ange sidan som startsida i webbplatsinställningarna. För knappen Meddela mig lägger du ett Formulär-block i läget Överlägg med ett ankare på samma sida och anger det ankaret i blocket. Formuläret sparar sina inskick och skickar sina egna mejl, men det mejlar inte besökarna när webbplatsen öppnar. Ta ner ofärdiga sidor med Avpublicera: ett utkast sparat över en publicerad sida låter den publicerade ligga kvar. Navigeringen utelämnar dem då för besökare.'
  },
  example: {
    blockType: 'coming-soon',
    badge: 'Opening soon',
    heading: "We're building something new",
    message:
      'Our new site is on its way. Leave your details and we will let you know the day it opens.',
    openingDate: '2027-03-01T00:00:00.000Z',
    contactEmail: 'hello@example.com',
    contactPhone: '+46 8 123 456 78',
    notifyLabel: 'Notify me',
    notifyAnchor: 'notify',
    showIllustration: true
  }
};
