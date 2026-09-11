import type {
  ReusableContentBlock as ReusableContentBlockProps,
  ReusableContent as ReusableContentType
} from '@codeware/shared/util/payload-types';

import type { BlockGalleryDoc } from '../gallery-doc';

/**
 * A shared document as the block receives one.
 *
 * The block is a pointer: whatever the document holds is what the page draws.
 * One callout is enough to show that, and enough to show it is the document's
 * own blocks doing the drawing rather than anything the block itself carries.
 */
const shared = {
  id: 1,
  title: 'Talk to us',
  layout: [
    {
      blockType: 'callout',
      showMark: false,
      heading: 'Kept in one place, used on every page',
      body: 'Edit this document once and every page pointing at it follows, which is the whole reason the block exists.',
      link: {
        type: 'custom',
        url: '/contact',
        label: 'Get in touch',
        newTab: false
      }
    }
  ]
} as unknown as ReusableContentType;

export const reusableContentGallery: BlockGalleryDoc<ReusableContentBlockProps> =
  {
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
    example: {
      blockType: 'reusable-content',
      reusableContent: shared
    }
  };
