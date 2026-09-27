import { a11yStory } from '@codeware/shared/util/storybook';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { BoldIcon, ItalicIcon, UnderlineIcon } from 'lucide-react';

import { Toggle } from './toggle';

const meta = {
  title: 'Shadcn/Toggle'
} satisfies Meta;

export default meta;

export const Demo: StoryObj = {
  render: () => (
    <div className="flex items-center gap-2">
      <Toggle aria-label="Toggle bold">
        <BoldIcon />
      </Toggle>
      <Toggle aria-label="Toggle italic" defaultPressed>
        <ItalicIcon />
      </Toggle>
      <Toggle aria-label="Toggle underline" variant="outline">
        <UnderlineIcon />
        Underline
      </Toggle>
      <Toggle aria-label="Toggle disabled" disabled>
        Disabled
      </Toggle>
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
