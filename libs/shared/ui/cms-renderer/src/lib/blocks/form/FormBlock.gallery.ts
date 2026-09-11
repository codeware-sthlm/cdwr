import type {
  FormBlock as FormBlockProps,
  Form as FormType
} from '@codeware/shared/util/payload-types';

import type { BlockGalleryDoc } from '../gallery-doc';

const paragraph = (text: string) =>
  ({
    root: {
      type: 'root',
      version: 1,
      direction: 'ltr',
      format: '',
      indent: 0,
      children: [
        {
          type: 'paragraph',
          version: 1,
          direction: 'ltr',
          format: '',
          indent: 0,
          children: [{ type: 'text', version: 1, text }]
        }
      ]
    }
    // The editor state is typed by the configured Lexical features, which a
    // fixture cannot satisfy without importing the editor itself
  }) as unknown as never;

const field = (
  blockType: 'text' | 'email' | 'textarea',
  name: string,
  label: string,
  width?: number
) => ({ blockType, name, label, required: true, width });

/**
 * A form document as the block receives one.
 *
 * Real enough to draw: every field an editor would have built in the form
 * builder. The renderer is told it is drawing an example, so the submit button
 * is disabled — nothing stands behind this form to receive a submission.
 */
const form = {
  id: 1,
  title: 'Contact',
  submitButtonLabel: 'Send',
  confirmationType: 'message',
  fields: [
    field('text', 'name', 'Name', 50),
    field('email', 'email', 'Email', 50),
    field('textarea', 'message', 'What are you working on?')
  ]
} as unknown as FormType;

export const formGallery: BlockGalleryDoc<FormBlockProps> = {
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
  example: {
    blockType: 'form',
    enableIntro: true,
    introContent: paragraph(
      'Tell us what you are building and we will come back to you.'
    ),
    form
  }
};
