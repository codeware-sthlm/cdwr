import type { RetiredBlockDoc } from '../gallery-doc';

/**
 * Described but not drawn: no collection offers this block any more, so no
 * layout can hold the fresh instance an example would need. The pages already
 * carrying one still draw it, which is why it stays described here.
 */
export const mediaGallery: RetiredBlockDoc = {
  name: {
    en: 'An uploaded picture, from before there was an image block',
    sv: 'En uppladdad bild, från tiden före bildblocket'
  },
  summary: {
    en: 'A picture with an optional caption. Retired: the image block replaces it.',
    sv: 'En bild med valfri bildtext. Utgått: bildblocket ersätter det.'
  },
  whenToUse: {
    en: 'Nothing new should reach for it. It was written to look at the uploaded file and choose a treatment, but the only thing it ever accepted was a picture — which the image block now does properly, with the caption where a caption belongs. Pages already carrying one keep drawing it, which is why it is still here and still described.',
    sv: 'Inget nytt ska använda det. Blocket skrevs för att titta på den uppladdade filen och välja hantering, men det enda det någonsin tog emot var en bild — och det gör bildblocket numera ordentligt, med bildtexten där en bildtext hör hemma. Sidor som redan innehåller ett sådant block ritar upp det som förut, och därför finns blocket kvar och beskrivs här.'
  },
  retired: true
};
