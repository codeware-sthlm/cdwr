import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList
} from '@codeware/shared/ui/shadcn/components/command';
import { a11yStory } from '@codeware/shared/util/storybook';
import { DocumentIcon, DocumentTextIcon } from '@heroicons/react/24/outline';
import type { Meta, StoryObj } from '@storybook/react-vite';

import { PaletteRow } from './palette-row';

const meta = {
  title: 'App CMS/Dashboard/PaletteRow'
} satisfies Meta;

export default meta;

export const Variants: StoryObj = {
  render: () => (
    <Command className="max-w-96 rounded-xl border">
      <CommandList>
        <CommandGroup heading="Pages">
          <CommandItem value="doc:pages:1">
            <PaletteRow
              title="Getting started"
              meta="Pages · 12 minutes ago"
              icon={DocumentIcon}
            />
          </CommandItem>
          <CommandItem value="doc:pages:2">
            <PaletteRow
              title="Untitled"
              meta="Pages · 2 hours ago"
              icon={DocumentIcon}
              badgeLabel="Draft"
            />
          </CommandItem>
        </CommandGroup>
        <CommandGroup heading="Posts">
          <CommandItem value="doc:posts:3">
            <PaletteRow
              title="A very long post title that should truncate gracefully instead of wrapping"
              meta="Posts · yesterday"
              icon={DocumentTextIcon}
              badgeLabel="Published"
            />
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </Command>
  )
};

export const PayloadAdminLight = a11yStory(Variants, 'payload-admin', 'light');
export const PayloadAdminDark = a11yStory(Variants, 'payload-admin', 'dark');
export const FrostLight = a11yStory(Variants, 'frost', 'light');
export const FrostDark = a11yStory(Variants, 'frost', 'dark');
