import type {
  ReusableContentBlock as ReusableContentBlockProps,
  ReusableContent as ReusableContentType
} from '@codeware/shared/util/payload-types';

import type { BlockGalleryDoc } from '../gallery-doc';

/**
 * A shared document as the block receives one.
 *
 * The block is a pointer: whatever the document holds is what the page draws.
 * Two unlike blocks rather than one, since a single one reads as a block with
 * an alias — the point is that a document holds as much as its editor put in
 * it, and the page draws all of it from one reference. Both are blocks the
 * collection actually offers, so this is a document an editor could build.
 */
const shared = {
  id: 1,
  title: 'Ways to reach us',
  layout: [
    {
      blockType: 'card',
      cards: [
        {
          brand: { icon: 'ChatBubbleLeftRightIcon', color: undefined },
          title: 'Talk it through',
          description: 'Half an hour, no slides.',
          content:
            'Bring the problem as it stands and we will say what we would do about it.',
          enableLink: true,
          link: {
            type: 'custom',
            url: '/contact',
            label: 'Book a call',
            newTab: false,
            navTrigger: 'link'
          }
        },
        {
          brand: { icon: 'EnvelopeIcon', color: undefined },
          title: 'Write instead',
          description: 'An answer the next working day.',
          content:
            'Longer questions are easier in writing, and easier to answer properly.',
          enableLink: true,
          link: {
            type: 'custom',
            url: '/contact',
            label: 'Send a message',
            newTab: false,
            navTrigger: 'link'
          }
        }
      ]
    },
    {
      blockType: 'social-media',
      direction: 'horizontal',
      social: [
        {
          id: '1',
          platform: 'github',
          url: 'https://github.com/codeware-sthlm'
        },
        {
          id: '2',
          platform: 'linkedin',
          url: 'https://linkedin.com/company/codeware'
        },
        { id: '3', platform: 'email', email: 'hello@codeware.se' }
      ]
    }
  ]
} as unknown as ReusableContentType;

export const reusableContentGallery: BlockGalleryDoc<ReusableContentBlockProps> =
  {
    name: {
      en: 'A shared piece of content',
      sv: 'Ett delat stycke innehåll'
    },
    summary: {
      en: 'A fragment authored in one place and referenced from many.',
      sv: 'Ett avsnitt som skrivs på ett ställe och refereras från flera.'
    },
    whenToUse: {
      en: 'For content that appears on several pages and should be edited in one place, such as an office address, a standard text or a contact section. The content is written once as its own document, and this block shows it. The document can hold several blocks, so a whole section can be reused.',
      sv: 'För innehåll som visas på flera sidor och ska redigeras på ett ställe, till exempel en besöksadress, en standardtext eller en kontaktruta. Innehållet skrivs en gång som ett eget dokument, och det här blocket visar det. Dokumentet kan innehålla flera block, så ett helt avsnitt kan återanvändas.'
    },
    example: {
      blockType: 'reusable-content',
      reusableContent: shared
    }
  };
