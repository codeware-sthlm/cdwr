import { a11yStory } from '@codeware/shared/util/storybook';
import type { Meta, StoryObj } from '@storybook/react-vite';

import { Button } from './button';
import { Input } from './input';
import { Label } from './label';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger
} from './sheet';

const meta = {
  title: 'Shadcn/Sheet'
} satisfies Meta;

export default meta;

export const Demo: StoryObj = {
  render: () => (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline">Open sheet</Button>
      </SheetTrigger>
      <SheetContent side="right">
        <SheetHeader>
          <SheetTitle>Edit profile</SheetTitle>
          <SheetDescription>
            Make changes to your profile here. Click save when you are done.
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-2 px-4">
          <Label htmlFor="sheet-demo-name">Name</Label>
          <Input id="sheet-demo-name" defaultValue="Pedro Duarte" />
        </div>
        <SheetFooter>
          <Button>Save changes</Button>
          <SheetClose asChild>
            <Button variant="outline">Cancel</Button>
          </SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
};

/** Local extension: the `size` prop caps the width from `sm` upward. */
export const Sizes: StoryObj = {
  render: () => (
    <div className="flex flex-wrap gap-3">
      {(['sm', 'md', 'lg', 'xl'] as const).map((size) => (
        <Sheet key={size}>
          <SheetTrigger asChild>
            <Button variant="outline">size=&quot;{size}&quot;</Button>
          </SheetTrigger>
          <SheetContent side="right" size={size}>
            <SheetHeader>
              <SheetTitle>Sheet size {size}</SheetTitle>
              <SheetDescription>
                Below the `sm` breakpoint every size goes full width, so the
                panel stays usable on a phone.
              </SheetDescription>
            </SheetHeader>
          </SheetContent>
        </Sheet>
      ))}
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
