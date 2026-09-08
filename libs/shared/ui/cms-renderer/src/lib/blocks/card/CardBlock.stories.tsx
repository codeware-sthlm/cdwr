import { a11yStory } from '@codeware/shared/util/storybook';
import type { Meta, StoryObj } from '@storybook/react-vite';

import { CardBlock } from './CardBlock';

const meta = {
  title: 'cms-renderer/CardBlock',
  component: CardBlock,
  parameters: { layout: 'padded' }
} satisfies Meta<typeof CardBlock>;

export default meta;
type Story = StoryObj<typeof meta>;

const cards: NonNullable<Story['args']>['cards'] = [
  {
    brand: { icon: 'CodeBracketIcon', color: undefined },
    title: 'Engineering',
    description: 'Type-safe APIs and clean architecture.',
    content: 'Full-stack development with modern tooling and proven patterns.',
    enableLink: true,
    link: {
      type: 'custom',
      url: '/services/engineering',
      label: 'Learn more',
      newTab: false,
      navTrigger: 'link'
    }
  },
  {
    brand: { icon: 'CpuChipIcon', color: undefined },
    title: 'Platform',
    description: 'Cloud-native deployments that just work.',
    content: 'CI/CD pipelines and infrastructure as code.',
    enableLink: true,
    link: {
      type: 'custom',
      url: '/services/platform',
      label: 'Learn more',
      newTab: false,
      navTrigger: 'link'
    }
  },
  {
    brand: { icon: 'SparklesIcon', color: undefined },
    title: 'Design Systems',
    description: 'Component libraries built to scale.',
    content: 'Accessible interfaces and coherent design tokens.',
    enableLink: true,
    link: {
      type: 'custom',
      url: '/services/design',
      label: 'Learn more',
      newTab: false,
      navTrigger: 'link'
    }
  }
];

export const ClickableCards: Story = {
  name: 'Clickable cards (card-level link)',
  args: {
    blockType: 'card',
    cards: cards.map((card) => ({
      ...card,
      link: { ...card.link, navTrigger: 'card' as const }
    }))
  }
};

export const WithBrandColors: Story = {
  name: 'With brand colors',
  args: {
    blockType: 'card',
    cards: [
      {
        brand: { icon: 'CodeBracketIcon', color: 'blue-500' },
        title: 'TypeScript',
        description: 'Type-safe from API to UI.',
        content: 'End-to-end type safety across the full stack.',
        enableLink: false
      },
      {
        brand: { icon: 'CpuChipIcon', color: 'green-500' },
        title: 'Infrastructure',
        description: 'Resilient and scalable.',
        content: 'Zero-downtime deployments with automatic rollback.',
        enableLink: false
      },
      {
        brand: { icon: 'SparklesIcon', color: 'purple-500' },
        title: 'Design',
        description: 'Pixel-perfect and accessible.',
        content: 'WCAG compliant components built on Radix UI.',
        enableLink: false
      }
    ]
  }
};

export const SingleCard: Story = {
  name: 'Single card',
  args: {
    blockType: 'card',
    cards: [cards[0]]
  }
};

export const Minimal: Story = {
  name: 'Minimal (no icon, no link)',
  args: {
    blockType: 'card',
    cards: [
      {
        title: 'Simple Card',
        description: 'A card without icon or link.',
        content: 'Card body content goes here.'
      },
      {
        title: 'Another Card',
        description: 'Another simple card without extras.',
        content: 'More card body content here.'
      }
    ]
  }
};

export const ExternalLink: Story = {
  name: 'External link',
  args: {
    blockType: 'card',
    cards: [
      {
        brand: { icon: 'CodeBracketSquareIcon', color: undefined },
        title: 'nx-payload',
        description: 'Nx plugin for Payload CMS.',
        content:
          'Generators and executors to integrate Payload into any Nx workspace.',
        enableLink: true,
        link: {
          type: 'custom',
          url: 'https://github.com/codeware-sthlm/nx-payload',
          label: 'View on GitHub',
          newTab: true,
          navTrigger: 'link'
        }
      }
    ]
  }
};

export const ShadcnLight = a11yStory(
  { args: { blockType: 'card', cards } },
  'shadcn',
  'light'
);
export const ShadcnDark = a11yStory(
  { args: { blockType: 'card', cards } },
  'shadcn',
  'dark'
);
export const PayloadAdminLight = a11yStory(
  { args: { blockType: 'card', cards } },
  'payload-admin',
  'light'
);
export const PayloadAdminDark = a11yStory(
  { args: { blockType: 'card', cards } },
  'payload-admin',
  'dark'
);
export const SpotlightLight = a11yStory(
  { args: { blockType: 'card', cards } },
  'spotlight',
  'light'
);
export const SpotlightDark = a11yStory(
  { args: { blockType: 'card', cards } },
  'spotlight',
  'dark'
);
export const CodewareLight = a11yStory(
  { args: { blockType: 'card', cards } },
  'codeware',
  'light'
);
export const CodewareDark = a11yStory(
  { args: { blockType: 'card', cards } },
  'codeware',
  'dark'
);
