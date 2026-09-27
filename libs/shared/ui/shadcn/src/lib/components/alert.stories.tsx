import { a11yStory } from '@codeware/shared/util/storybook';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { AlertCircleIcon, CheckCircle2Icon } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from './alert';

const meta = {
  title: 'Shadcn/Alert'
} satisfies Meta;

export default meta;

export const Demo: StoryObj = {
  render: () => (
    <div className="flex w-md flex-col gap-4">
      <Alert>
        <CheckCircle2Icon />
        <AlertTitle>Success! Your changes have been saved</AlertTitle>
        <AlertDescription>
          This is an alert with icon, title and description.
        </AlertDescription>
      </Alert>
      <Alert variant="destructive">
        <AlertCircleIcon />
        <AlertTitle>Unable to process your payment.</AlertTitle>
        <AlertDescription>
          Please verify your billing information and try again.
        </AlertDescription>
      </Alert>
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
