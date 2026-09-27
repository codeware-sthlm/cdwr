import { a11yStory } from '@codeware/shared/util/storybook';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { SearchIcon } from 'lucide-react';

import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText
} from './input-group';

const meta = {
  title: 'Shadcn/InputGroup'
} satisfies Meta;

export default meta;

export const Demo: StoryObj = {
  render: () => (
    <div className="flex w-80 flex-col gap-6">
      <InputGroup>
        <InputGroupAddon>
          <SearchIcon className="size-4" />
        </InputGroupAddon>
        <InputGroupInput placeholder="Search…" aria-label="Search" />
        <InputGroupAddon align="inline-end">
          <kbd className="bg-muted text-muted-foreground rounded border px-1 font-sans text-[10px]">
            ⌘K
          </kbd>
        </InputGroupAddon>
      </InputGroup>
      <InputGroup>
        <InputGroupText>https://</InputGroupText>
        <InputGroupInput placeholder="example.com" aria-label="Website URL" />
        <InputGroupAddon align="inline-end">
          <InputGroupButton>Copy</InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
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
