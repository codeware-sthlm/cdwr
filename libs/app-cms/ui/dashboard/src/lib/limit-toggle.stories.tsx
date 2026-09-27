import { a11yStory } from '@codeware/shared/util/storybook';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';

import { LimitToggle } from './limit-toggle';

const meta = {
  title: 'App CMS/Dashboard/LimitToggle'
} satisfies Meta;

export default meta;

export const Interactive: StoryObj = {
  render: function Render() {
    const [value, setValue] = useState(5);
    return (
      <LimitToggle
        label="Number of items to show"
        options={[5, 10, 20]}
        value={value}
        onValueChange={setValue}
      />
    );
  }
};

export const PayloadAdminLight = a11yStory(
  Interactive,
  'payload-admin',
  'light'
);
export const PayloadAdminDark = a11yStory(Interactive, 'payload-admin', 'dark');
export const FrostLight = a11yStory(Interactive, 'frost', 'light');
export const FrostDark = a11yStory(Interactive, 'frost', 'dark');
