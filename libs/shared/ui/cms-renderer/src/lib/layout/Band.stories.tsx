import { a11yStory } from '@codeware/shared/util/storybook';
import type { Meta, StoryObj } from '@storybook/react-vite';

import { featureCardsGallery } from '../blocks/feature-cards/FeatureCardsBlock.gallery';
import { featureSectionGallery } from '../blocks/feature-section/FeatureSectionBlock.gallery';
import { pillListGallery } from '../blocks/pill-list/PillListBlock.gallery';
import { RenderBlocks } from '../RenderBlocks';

import { ContainerOuter } from './Container';

/**
 * A slice of a page, drawn the way a page draws it: none, subtle and strong
 * in turn, each spanning the sheet between the container's two layers.
 */
function PageSlice(props: React.ComponentProps<typeof RenderBlocks>) {
  return (
    <ContainerOuter>
      <RenderBlocks {...props} />
    </ContainerOuter>
  );
}

const meta = {
  title: 'cms-renderer/Band',
  component: PageSlice,
  parameters: { layout: 'fullscreen' }
} satisfies Meta<typeof PageSlice>;

export default meta;
type Story = StoryObj<typeof meta>;

const args: Story['args'] = {
  framed: true,
  blocks: [
    { ...featureCardsGallery.example, band: 'none' },
    { ...pillListGallery.example, band: 'subtle' },
    { ...featureSectionGallery.example, band: 'strong' }
  ]
};

export const OnAPage: Story = { name: 'On a page', args };

// Nested in a column, or drawn in the gallery: no sheet to span
export const Contained: Story = {
  name: 'Contained',
  args: { ...args, framed: false }
};

export const ShadcnLight = a11yStory({ args }, 'shadcn', 'light');
export const ShadcnDark = a11yStory({ args }, 'shadcn', 'dark');
export const PayloadAdminLight = a11yStory({ args }, 'payload-admin', 'light');
export const PayloadAdminDark = a11yStory({ args }, 'payload-admin', 'dark');
export const SpotlightLight = a11yStory({ args }, 'spotlight', 'light');
export const SpotlightDark = a11yStory({ args }, 'spotlight', 'dark');
export const CodewareLight = a11yStory({ args }, 'codeware', 'light');
export const CodewareDark = a11yStory({ args }, 'codeware', 'dark');
