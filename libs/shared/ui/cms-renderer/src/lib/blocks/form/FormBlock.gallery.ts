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
  summary: {
    en: 'A form built in the admin, with its fields and confirmation.',
    sv: 'Ett formulär byggt i administrationen, med sina fält och sin bekräftelse.'
  },
  whenToUse: {
    en: 'When visitors should be able to send something, such as a question or a booking request. The form is built once under Forms and chosen here, so the same form can be used on several pages. Submissions are stored in the admin.',
    sv: 'När besökare ska kunna skicka något, till exempel en fråga eller en bokningsförfrågan. Formuläret byggs en gång under Formulär och väljs här, så samma formulär kan användas på flera sidor. Inskickade svar sparas i administrationen.'
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
