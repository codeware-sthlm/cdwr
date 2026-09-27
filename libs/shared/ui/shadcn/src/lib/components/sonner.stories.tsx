import { a11yStory } from '@codeware/shared/util/storybook';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { toast } from 'sonner';

import { Button } from './button';
import { Toaster } from './sonner';

const meta = {
  title: 'Shadcn/Sonner'
} satisfies Meta;

export default meta;

export const Demo: StoryObj = {
  render: () => (
    <div>
      <Toaster position="bottom-right" />
      <div className="flex gap-2">
        <Button
          variant="outline"
          onClick={() =>
            toast('Event has been created', {
              description: 'Sunday, December 03, 2023 at 9:00 AM'
            })
          }
        >
          Show toast
        </Button>
        <Button
          variant="outline"
          onClick={() => toast.success('Changes saved')}
        >
          Success
        </Button>
        <Button
          variant="outline"
          onClick={() => toast.error('Something went wrong')}
        >
          Error
        </Button>
      </div>
    </div>
  )
};

// sonner mounts its own `section` landmark per Toaster instance; the storybook
// canvas already provides one, so axe sees two unlabelled landmarks. The
// duplicate comes from sonner's internals, not from how we render it.
const disabled = ['landmark-unique'];

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
