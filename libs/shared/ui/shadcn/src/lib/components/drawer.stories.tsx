import { a11yStory } from '@codeware/shared/util/storybook';
import type { Meta, StoryObj } from '@storybook/react-vite';

import { Button } from './button';
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger
} from './drawer';

const meta = {
  title: 'Shadcn/Drawer'
} satisfies Meta;

export default meta;

export const Demo: StoryObj = {
  render: () => (
    <Drawer>
      <DrawerTrigger asChild>
        <Button variant="outline">Open bottom drawer</Button>
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Move goal</DrawerTitle>
          <DrawerDescription>Set your daily activity goal.</DrawerDescription>
        </DrawerHeader>
        <div className="text-muted-foreground p-4 pt-0 text-sm">
          Drag the handle or press Escape to close.
        </div>
        <DrawerFooter>
          <Button>Submit</Button>
          <DrawerClose asChild>
            <Button variant="outline">Cancel</Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
};

/** Floating inset panel used by the CMS admin help drawer. */
export const FloatingRight: StoryObj = {
  render: () => (
    <Drawer direction="right">
      <DrawerTrigger asChild>
        <Button variant="outline">Open right drawer</Button>
      </DrawerTrigger>
      <DrawerContent className="after:hidden data-[vaul-drawer-direction=right]:inset-y-2 data-[vaul-drawer-direction=right]:right-2 data-[vaul-drawer-direction=right]:rounded-xl data-[vaul-drawer-direction=right]:border">
        <DrawerHeader>
          <DrawerTitle>Floating panel</DrawerTitle>
          <DrawerDescription>
            Inset with rounded corners on all sides; vaul&apos;s over-drag
            filler is hidden.
          </DrawerDescription>
        </DrawerHeader>
      </DrawerContent>
    </Drawer>
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
