import { a11yStory } from '@codeware/shared/util/storybook';
import type { Meta, StoryObj } from '@storybook/react-vite';

import { Sparkline } from './sparkline';

const meta = {
  title: 'App CMS/Dashboard/Sparkline'
} satisfies Meta;

export default meta;

const Frame = ({ children }: { children: React.ReactNode }) => (
  <div className="text-foreground w-80">{children}</div>
);

export const Series: StoryObj = {
  render: () => (
    <Frame>
      <Sparkline
        values={[3, 5, 4, 9, 7, 12, 10, 14, 11, 16, 13, 18]}
        label="Visitors per day"
      />
    </Frame>
  )
};

/** Nothing to draw but a flat line, and no NaN in the path */
export const AllZero: StoryObj = {
  render: () => (
    <Frame>
      <Sparkline values={[0, 0, 0, 0, 0, 0, 0]} label="Visitors per day" />
    </Frame>
  )
};

export const SingleValue: StoryObj = {
  render: () => (
    <Frame>
      <Sparkline values={[5]} label="Visitors per day" />
    </Frame>
  )
};

export const PayloadAdminLight = a11yStory(Series, 'payload-admin', 'light');
export const PayloadAdminDark = a11yStory(Series, 'payload-admin', 'dark');
export const FrostLight = a11yStory(Series, 'frost', 'light');
export const FrostDark = a11yStory(Series, 'frost', 'dark');
