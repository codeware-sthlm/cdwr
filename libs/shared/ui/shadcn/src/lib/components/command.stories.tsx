import { a11yStory } from '@codeware/shared/util/storybook';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { CalendarIcon, SettingsIcon, SmileIcon, UserIcon } from 'lucide-react';

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut
} from './command';

const meta = {
  title: 'Shadcn/Command'
} satisfies Meta;

export default meta;

export const Demo: StoryObj = {
  render: () => (
    <Command className="border-border w-96 border">
      <CommandInput placeholder="Type a command or search…" />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Suggestions">
          <CommandItem>
            <CalendarIcon />
            Calendar
          </CommandItem>
          <CommandItem>
            <SmileIcon />
            Search emoji
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Settings">
          <CommandItem>
            <UserIcon />
            Profile
            <CommandShortcut>⌘P</CommandShortcut>
          </CommandItem>
          <CommandItem>
            <SettingsIcon />
            Settings
            <CommandShortcut>⌘S</CommandShortcut>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </Command>
  )
};

// cmdk renders the list as `role="listbox"` but groups its items under
// `role="group"` wrappers, which axe reads as a listbox without option
// children. The markup is owned by cmdk, so the rule is off for this story.
const disabled = ['aria-required-children'];

export const FrostLight = a11yStory(Demo, 'frost', 'light', disabled);
export const FrostDark = a11yStory(Demo, 'frost', 'dark', disabled);
export const PayloadAdminLight = a11yStory(
  Demo,
  'payload-admin',
  'light',
  disabled
);
export const PayloadAdminDark = a11yStory(
  Demo,
  'payload-admin',
  'dark',
  disabled
);
export const SpotlightLight = a11yStory(Demo, 'spotlight', 'light', disabled);
export const SpotlightDark = a11yStory(Demo, 'spotlight', 'dark', disabled);
export const CodewareLight = a11yStory(Demo, 'codeware', 'light', disabled);
export const CodewareDark = a11yStory(Demo, 'codeware', 'dark', disabled);
