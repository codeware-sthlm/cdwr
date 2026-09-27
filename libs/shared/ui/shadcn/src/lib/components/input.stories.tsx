import { a11yStory } from '@codeware/shared/util/storybook';
import type { Meta, StoryObj } from '@storybook/react-vite';

import { Input } from './input';
import { Label } from './label';

const meta = {
  title: 'Shadcn/Input'
} satisfies Meta;

export default meta;

export const Demo: StoryObj = {
  render: () => (
    <div className="flex w-80 flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Label htmlFor="input-demo-email">Email</Label>
        <Input id="input-demo-email" type="email" placeholder="Email" />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="input-demo-file">Picture</Label>
        <Input id="input-demo-file" type="file" />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="input-demo-disabled">Disabled</Label>
        <Input id="input-demo-disabled" disabled placeholder="Disabled" />
      </div>
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
