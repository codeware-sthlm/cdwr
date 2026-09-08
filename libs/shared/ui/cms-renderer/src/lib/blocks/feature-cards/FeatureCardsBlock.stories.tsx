import { a11yStory } from '@codeware/shared/util/storybook';
import type { Meta, StoryObj } from '@storybook/react-vite';

import { FeatureCardsBlock } from './FeatureCardsBlock';

const meta = {
  title: 'cms-renderer/FeatureCardsBlock',
  component: FeatureCardsBlock,
  parameters: { layout: 'padded' }
} satisfies Meta<typeof FeatureCardsBlock>;

export default meta;
type Story = StoryObj<typeof meta>;

const args: Story['args'] = {
  blockType: 'feature-cards',
  eyebrow: 'Capabilities',
  heading: 'What we do',
  intro:
    'From product strategy to production-grade systems — we handle the full stack.',
  columns: 'auto',
  items: [
    {
      brand: { icon: 'CodeBracketIcon', color: undefined },
      title: 'Engineering',
      description:
        'Full-stack development with modern tooling, type-safe APIs and clean architecture.'
    },
    {
      brand: { icon: 'CpuChipIcon', color: undefined },
      title: 'Platform',
      description:
        'CI/CD, infrastructure as code and cloud-native deployments that just work.'
    },
    {
      brand: { icon: 'SparklesIcon', color: undefined },
      title: 'Design',
      description:
        'Component libraries, design systems and accessible interfaces built to scale.'
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
