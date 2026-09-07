import { a11yStory } from '@codeware/shared/util/storybook';
import type { Meta, StoryObj } from '@storybook/react-vite';

import { TestimonialBlock } from './TestimonialBlock';

const meta = {
  title: 'cms-renderer/TestimonialBlock',
  component: TestimonialBlock,
  parameters: { layout: 'padded' }
} satisfies Meta<typeof TestimonialBlock>;

export default meta;
type Story = StoryObj<typeof meta>;

const args: Story['args'] = {
  blockType: 'testimonial',
  quote:
    'The reporting we used to assemble by hand every quarter now generates itself, and it kept working after the person who built it moved on.',
  author: {
    name: 'A. Nilsson',
    role: 'Head of Finance Systems'
  },
  enableLink: true,
  link: {
    type: 'custom',
    label: 'Read the story',
    url: '/work',
    newTab: false
  }
};

export const Default: Story = {
  args
};

/** Name alone is enough attribution when there is no role to give. */
export const NameOnly: Story = {
  args: {
    ...args,
    author: { name: 'A. Nilsson' },
    enableLink: false
  }
};

/**
 * The quote carries it. Without a logo or a link the right column collapses
 * rather than leaving a gap where something used to be.
 */
export const QuoteOnly: Story = {
  args: {
    ...args,
    enableLink: false
  }
};

/** A longer quote still has to stay readable — this is the upper bound. */
export const LongQuote: Story = {
  args: {
    ...args,
    quote:
      'We came in expecting a rebuild and got a migration instead. The old system kept serving traffic the whole way through, the tests told us when a step was safe, and the team that inherited it could read what had been done and why.'
  }
};

export const ShadcnLight = a11yStory({ args }, 'shadcn', 'light');
export const ShadcnDark = a11yStory({ args }, 'shadcn', 'dark');
export const PayloadAdminLight = a11yStory({ args }, 'payload-admin', 'light');
export const PayloadAdminDark = a11yStory({ args }, 'payload-admin', 'dark');
export const SpotlightLight = a11yStory({ args }, 'spotlight', 'light');
export const SpotlightDark = a11yStory({ args }, 'spotlight', 'dark');
export const CodewareLight = a11yStory({ args }, 'codeware', 'light');
export const CodewareDark = a11yStory({ args }, 'codeware', 'dark');
