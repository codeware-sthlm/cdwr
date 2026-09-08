import type { Form } from '@codeware/shared/util/payload-types';
import { a11yStory } from '@codeware/shared/util/storybook';
import type { Meta, StoryObj } from '@storybook/react-vite';

import { FormBlock } from './FormBlock';

const meta = {
  title: 'cms-renderer/FormBlock',
  component: FormBlock,
  parameters: { layout: 'padded' }
} satisfies Meta<typeof FormBlock>;

export default meta;
type Story = StoryObj<typeof meta>;

const timestamps = {
  updatedAt: '2024-01-01T00:00:00.000Z',
  createdAt: '2024-01-01T00:00:00.000Z'
};

const confirmationMessage = {
  root: {
    type: 'root',
    version: 1,
    children: [
      {
        type: 'paragraph',
        version: 1,
        children: [
          {
            type: 'text',
            version: 1,
            text: "Thank you! We'll be in touch within one business day."
          }
        ],
        direction: 'ltr' as const,
        format: '' as const,
        indent: 0
      }
    ],
    direction: 'ltr' as const,
    format: '' as const,
    indent: 0
  }
};

const contactForm: Form = {
  id: 1,
  title: 'Contact',
  ...timestamps,
  submitButtonLabel: 'Send message',
  confirmationType: 'message',
  confirmationMessage,
  fields: [
    {
      blockType: 'text',
      name: 'name',
      label: 'Full name',
      placeholder: 'Your full name',
      required: true
    },
    {
      blockType: 'email',
      name: 'email',
      label: 'Email',
      placeholder: 'you@example.com',
      required: true
    },
    {
      blockType: 'textarea',
      name: 'message',
      label: 'Message',
      placeholder: 'How can we help?',
      required: true
    }
  ]
};

const allFieldsForm: Form = {
  id: 2,
  title: 'All field types',
  ...timestamps,
  submitButtonLabel: 'Submit',
  confirmationType: 'message',
  confirmationMessage,
  fields: [
    {
      blockType: 'message',
      message: {
        root: {
          type: 'root',
          version: 1,
          children: [
            {
              type: 'paragraph',
              version: 1,
              children: [
                {
                  type: 'text',
                  version: 1,
                  text: 'Fill in all fields to see every input type in action.'
                }
              ],
              direction: 'ltr' as const,
              format: '' as const,
              indent: 0
            }
          ],
          direction: 'ltr' as const,
          format: '' as const,
          indent: 0
        }
      }
    },
    {
      blockType: 'text',
      name: 'text',
      label: 'Text',
      placeholder: 'Plain text input'
    },
    {
      blockType: 'email',
      name: 'email',
      label: 'Email',
      placeholder: 'email@example.com'
    },
    { blockType: 'number', name: 'number', label: 'Number', placeholder: '42' },
    {
      blockType: 'textarea',
      name: 'bio',
      label: 'Textarea',
      placeholder: 'Multi-line text...'
    },
    {
      blockType: 'select',
      name: 'plan',
      label: 'Select',
      placeholder: 'Choose a plan',
      options: [
        { label: 'Starter', value: 'starter' },
        { label: 'Pro', value: 'pro' },
        { label: 'Enterprise', value: 'enterprise' }
      ]
    },
    {
      blockType: 'radio',
      name: 'contact_preference',
      label: 'Radio',
      options: [
        { label: 'Email', value: 'email' },
        { label: 'Phone', value: 'phone' }
      ]
    },
    {
      blockType: 'checkbox',
      name: 'agree',
      label: 'I agree to the terms and conditions'
    },
    {
      blockType: 'country',
      name: 'country',
      label: 'Country',
      placeholder: 'Select country'
    }
  ]
};

export const AllFieldTypes: Story = {
  name: 'All field types',
  args: { blockType: 'form', form: allFieldsForm }
};

export const WithIntro: Story = {
  name: 'With intro',
  args: {
    blockType: 'form',
    form: contactForm,
    enableIntro: true,
    introContent: {
      root: {
        type: 'root',
        version: 1,
        children: [
          {
            type: 'heading',
            version: 1,
            tag: 'h2',
            children: [{ type: 'text', version: 1, text: 'Get in touch' }],
            direction: 'ltr' as const,
            format: '' as const,
            indent: 0
          },
          {
            type: 'paragraph',
            version: 1,
            children: [
              {
                type: 'text',
                version: 1,
                text: 'Tell us about your project and we’ll follow up within one business day.'
              }
            ],
            direction: 'ltr' as const,
            format: '' as const,
            indent: 0
          }
        ],
        direction: 'ltr' as const,
        format: '' as const,
        indent: 0
      }
    }
  }
};

export const ShadcnLight = a11yStory(
  { args: { blockType: 'form', form: contactForm } },
  'shadcn',
  'light'
);
export const ShadcnDark = a11yStory(
  { args: { blockType: 'form', form: contactForm } },
  'shadcn',
  'dark'
);
export const PayloadAdminLight = a11yStory(
  { args: { blockType: 'form', form: contactForm } },
  'payload-admin',
  'light'
);
export const PayloadAdminDark = a11yStory(
  { args: { blockType: 'form', form: contactForm } },
  'payload-admin',
  'dark'
);
export const SpotlightLight = a11yStory(
  { args: { blockType: 'form', form: contactForm } },
  'spotlight',
  'light'
);
export const SpotlightDark = a11yStory(
  { args: { blockType: 'form', form: contactForm } },
  'spotlight',
  'dark'
);
export const CodewareLight = a11yStory(
  { args: { blockType: 'form', form: contactForm } },
  'codeware',
  'light'
);
export const CodewareDark = a11yStory(
  { args: { blockType: 'form', form: contactForm } },
  'codeware',
  'dark'
);
