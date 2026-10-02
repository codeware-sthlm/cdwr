import type { Meta, StoryObj } from '@storybook/react-vite';
import { ChevronsUpDownIcon } from 'lucide-react';

import { Button } from './button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger
} from './collapsible';

const meta = {
  title: 'Shadcn/Collapsible'
} satisfies Meta;

export default meta;

export const Demo: StoryObj = {
  render: () => (
    <Collapsible className="flex w-80 flex-col gap-2">
      <div className="flex items-center justify-between gap-4">
        <h4 className="text-sm font-semibold">3 inputs declared</h4>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="icon-sm">
            <ChevronsUpDownIcon />
            <span className="sr-only">Toggle</span>
          </Button>
        </CollapsibleTrigger>
      </div>
      <div className="rounded-md border px-3 py-2 text-sm">label</div>
      <CollapsibleContent className="flex flex-col gap-2">
        <div className="rounded-md border px-3 py-2 text-sm">step</div>
        <div className="rounded-md border px-3 py-2 text-sm">compact</div>
      </CollapsibleContent>
    </Collapsible>
  )
};
