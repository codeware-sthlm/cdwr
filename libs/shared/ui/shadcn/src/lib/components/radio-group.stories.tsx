import { a11yStory } from '@codeware/shared/util/storybook';
import type { Meta, StoryObj } from '@storybook/react-vite';

import { Label } from './label';
import { RadioGroup, RadioGroupItem } from './radio-group';

const meta = {
  title: 'Shadcn/RadioGroup'
} satisfies Meta;

export default meta;

export const Demo: StoryObj = {
  render: () => (
    <RadioGroup defaultValue="comfortable">
      <div className="flex items-center gap-2">
        <RadioGroupItem value="default" id="rg-default" />
        <Label htmlFor="rg-default">Default</Label>
      </div>
      <div className="flex items-center gap-2">
        <RadioGroupItem value="comfortable" id="rg-comfortable" />
        <Label htmlFor="rg-comfortable">Comfortable</Label>
      </div>
      <div className="flex items-center gap-2">
        <RadioGroupItem value="compact" id="rg-compact" />
        <Label htmlFor="rg-compact">Compact</Label>
      </div>
    </RadioGroup>
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
