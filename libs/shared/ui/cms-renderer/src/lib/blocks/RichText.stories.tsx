import { a11yStory } from '@codeware/shared/util/storybook';
import type { Meta, StoryObj } from '@storybook/react-vite';

import { RichText } from './RichText';

const meta = {
  title: 'cms-renderer/RichText',
  component: RichText,
  parameters: { layout: 'padded' }
} satisfies Meta<typeof RichText>;

export default meta;
type Story = StoryObj<typeof meta>;

const paragraph = (text: string) => ({
  type: 'paragraph',
  version: 1,
  children: [{ type: 'text', version: 1, text }],
  direction: 'ltr' as const,
  format: '' as const,
  indent: 0
});

const heading = (text: string, tag: 'h2' | 'h3') => ({
  type: 'heading',
  version: 1,
  tag,
  children: [{ type: 'text', version: 1, text }],
  direction: 'ltr' as const,
  format: '' as const,
  indent: 0
});

const bulletList = (items: Array<string>) => ({
  type: 'list',
  version: 1,
  listType: 'bullet',
  tag: 'ul',
  start: 1,
  direction: 'ltr' as const,
  format: '' as const,
  indent: 0,
  children: items.map((text, i) => ({
    type: 'listitem',
    version: 1,
    value: i + 1,
    children: [{ type: 'text', version: 1, text }],
    direction: 'ltr' as const,
    format: '' as const,
    indent: 0
  }))
});

const lexical = (
  children: Array<unknown>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any => ({
  root: {
    type: 'root',
    version: 1,
    children,
    direction: 'ltr' as const,
    format: '' as const,
    indent: 0
  }
});

const proseContent = lexical([
  heading('What we do', 'h2'),
  paragraph(
    'We design and engineer digital products that help ambitious companies move faster and scale smarter.'
  ),
  heading('Our services', 'h3'),
  bulletList([
    'Full-stack engineering with TypeScript and React',
    'Platform and DevOps — CI/CD, IaC, cloud-native deployments',
    'Design systems built on Radix UI and Tailwind CSS',
    'Content platforms powered by Payload CMS'
  ]),
  heading('How we work', 'h3'),
  paragraph(
    'We embed with your team as hands-on builders. No hand-offs, no overhead — just focused execution from day one.'
  ),
  paragraph(
    'Every engagement starts with a discovery phase to align on goals, constraints, and success metrics before any code is written.'
  )
]);

export const Prose: Story = {
  args: { data: proseContent }
};

export const DisabledProse: Story = {
  name: 'Prose disabled',
  args: {
    data: lexical([
      paragraph(
        'Without prose the text uses no typography classes — suitable when the parent provides its own styling.'
      )
    ]),
    disableProse: true
  }
};

export const MinimalParagraph: Story = {
  name: 'Single paragraph',
  args: {
    data: lexical([
      paragraph(
        'A single paragraph rendered with default prose styles. Useful for captions, descriptions, or inline rich text fields.'
      )
    ])
  }
};

export const FrostLight = a11yStory(
  { args: { data: proseContent } },
  'frost',
  'light'
);
export const FrostDark = a11yStory(
  { args: { data: proseContent } },
  'frost',
  'dark'
);
export const PayloadAdminLight = a11yStory(
  { args: { data: proseContent } },
  'payload-admin',
  'light'
);
export const PayloadAdminDark = a11yStory(
  { args: { data: proseContent } },
  'payload-admin',
  'dark'
);
export const SpotlightLight = a11yStory(
  { args: { data: proseContent } },
  'spotlight',
  'light'
);
export const SpotlightDark = a11yStory(
  { args: { data: proseContent } },
  'spotlight',
  'dark'
);
export const CodewareLight = a11yStory(
  { args: { data: proseContent } },
  'codeware',
  'light'
);
export const CodewareDark = a11yStory(
  { args: { data: proseContent } },
  'codeware',
  'dark'
);
