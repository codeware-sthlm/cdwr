import { a11yStory } from '@codeware/shared/util/storybook';
import type { Meta, StoryObj } from '@storybook/react-vite';

import { ShowcaseBlock } from './ShowcaseBlock';

const meta = {
  title: 'cms-renderer/ShowcaseBlock',
  component: ShowcaseBlock,
  parameters: { layout: 'padded' }
} satisfies Meta<typeof ShowcaseBlock>;

export default meta;
type Story = StoryObj<typeof meta>;

const args: Story['args'] = {
  blockType: 'showcase',
  eyebrow: 'Selected Work',
  heading: 'What we have shipped',
  intro:
    'A selection of products and platforms we have designed and engineered.',
  enableHeaderLink: true,
  link: {
    type: 'custom',
    url: '/work',
    label: 'All projects',
    newTab: false
  },
  items: [
    {
      tag: 'Platform',
      title: 'Codeware Dev',
      description:
        'Multi-tenant CMS platform built on Payload CMS, Next.js and Nx. Powers content for multiple brands from a single deployment.',
      meta: 'Nx · Payload · Postgres · Next.js · Fly.io',
      link: {
        type: 'custom',
        url: '/work/codeware-dev',
        label: 'View case study',
        newTab: false
      }
    },
    {
      tag: 'Open Source',
      title: 'nx-payload',
      description:
        'Nx plugin that integrates Payload CMS into any Nx workspace with generators, executors and type-safe configuration.',
      meta: 'Nx · TypeScript · npm',
      link: {
        type: 'custom',
        url: 'https://github.com/codeware-sthlm/nx-payload',
        label: 'View on GitHub',
        newTab: true
      }
    }
  ]
};

export const Default: Story = {
  args
};

export const ShadcnLight = a11yStory({ args }, 'shadcn', 'light');
export const ShadcnDark = a11yStory({ args }, 'shadcn', 'dark');
export const PayloadAdminLight = a11yStory({ args }, 'payload-admin', 'light');
export const PayloadAdminDark = a11yStory({ args }, 'payload-admin', 'dark');
export const SpotlightLight = a11yStory({ args }, 'spotlight', 'light');
export const SpotlightDark = a11yStory({ args }, 'spotlight', 'dark');
export const CodewareLight = a11yStory({ args }, 'codeware', 'light');
export const CodewareDark = a11yStory({ args }, 'codeware', 'dark');
