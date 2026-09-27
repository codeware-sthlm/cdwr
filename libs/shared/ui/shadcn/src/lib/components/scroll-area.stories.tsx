import { a11yStory } from '@codeware/shared/util/storybook';
import type { Meta, StoryObj } from '@storybook/react-vite';
import * as React from 'react';

import { ScrollArea } from './scroll-area';
import { Separator } from './separator';

const meta = {
  title: 'Shadcn/ScrollArea'
} satisfies Meta;

export default meta;

const tags = Array.from({ length: 30 }).map((_, i) => `v1.2.0-beta.${30 - i}`);

export const Demo: StoryObj = {
  render: () => (
    <ScrollArea className="border-border h-72 w-48 rounded-lg border">
      <div className="p-4">
        <h4 className="text-sm leading-none font-medium">Tags</h4>
        {tags.map((tag) => (
          <React.Fragment key={tag}>
            <Separator className="my-2" />
            <div className="text-sm">{tag}</div>
          </React.Fragment>
        ))}
      </div>
    </ScrollArea>
  )
};

// Radix owns the scroll viewport and renders it without a tabindex, so axe
// reports the scrollable region as unreachable by keyboard. Adding a tabindex
// from our side would fight Radix's own focus management.
const disabled = ['scrollable-region-focusable'];

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
