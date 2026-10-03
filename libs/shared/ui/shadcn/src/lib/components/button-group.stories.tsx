import { a11yStory } from '@codeware/shared/util/storybook';
import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  BoldIcon,
  ChevronDownIcon,
  ItalicIcon,
  MinusIcon,
  PlusIcon,
  UnderlineIcon
} from 'lucide-react';

import { Button } from './button';
import {
  ButtonGroup,
  ButtonGroupSeparator,
  ButtonGroupText
} from './button-group';
import { Input } from './input';

const meta = {
  title: 'Shadcn/ButtonGroup'
} satisfies Meta;

export default meta;

export const Demo: StoryObj = {
  render: () => (
    <div className="flex flex-col gap-4">
      <ButtonGroup aria-label="Text style">
        <Button variant="outline" size="icon" aria-label="Bold">
          <BoldIcon />
        </Button>
        <Button variant="outline" size="icon" aria-label="Italic">
          <ItalicIcon />
        </Button>
        <Button variant="outline" size="icon" aria-label="Underline">
          <UnderlineIcon />
        </Button>
      </ButtonGroup>
      <ButtonGroup aria-label="Save">
        <Button>Save</Button>
        <ButtonGroupSeparator />
        <Button size="icon" aria-label="More ways to save">
          <ChevronDownIcon />
        </Button>
      </ButtonGroup>
      <ButtonGroup aria-label="Quantity">
        <Button variant="outline" size="icon" aria-label="Fewer">
          <MinusIcon />
        </Button>
        <ButtonGroupText>12</ButtonGroupText>
        <Button variant="outline" size="icon" aria-label="More">
          <PlusIcon />
        </Button>
      </ButtonGroup>
      <ButtonGroup aria-label="Search">
        <Input placeholder="Search" aria-label="Search" />
        <Button variant="outline">Go</Button>
      </ButtonGroup>
      <ButtonGroup orientation="vertical" aria-label="Alignment">
        <Button variant="outline" size="sm">
          Left
        </Button>
        <Button variant="outline" size="sm">
          Centre
        </Button>
        <Button variant="outline" size="sm">
          Right
        </Button>
      </ButtonGroup>
      <ButtonGroup aria-label="Toolbar">
        <Button variant="toolbar" size="sm">
          Import
        </Button>
        <Button variant="toolbar" size="sm">
          Format
        </Button>
        <Button variant="toolbar" size="sm" disabled>
          Check
        </Button>
      </ButtonGroup>
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
