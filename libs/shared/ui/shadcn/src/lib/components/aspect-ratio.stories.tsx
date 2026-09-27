import { a11yStory } from '@codeware/shared/util/storybook';
import type { Meta, StoryObj } from '@storybook/react-vite';

import { AspectRatio } from './aspect-ratio';

const meta = {
  title: 'Shadcn/AspectRatio'
} satisfies Meta;

export default meta;

export const Demo: StoryObj = {
  render: () => (
    <div className="w-96">
      <AspectRatio
        ratio={16 / 9}
        className="bg-muted flex items-center justify-center rounded-lg"
      >
        <span className="text-muted-foreground text-sm">16 : 9</span>
      </AspectRatio>
    </div>
  )
};

export const FrostLight = a11yStory(Demo, 'frost', 'light');
export const FrostDark = a11yStory(Demo, 'frost', 'dark');
export const PayloadAdminLight = a11yStory(Demo, 'payload-admin', 'light');
export const PayloadAdminDark = a11yStory(Demo, 'payload-admin', 'dark');
export const SpotlightLight = a11yStory(Demo, 'spotlight', 'light');
export const SpotlightDark = a11yStory(Demo, 'spotlight', 'dark');
export const CodewareLight = a11yStory(Demo, 'codeware', 'light');
export const CodewareDark = a11yStory(Demo, 'codeware', 'dark');
