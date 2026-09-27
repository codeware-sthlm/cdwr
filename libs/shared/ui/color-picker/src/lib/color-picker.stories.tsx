import { a11yStory } from '@codeware/shared/util/storybook';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';

import { ColorPicker, type ColorPickerColor } from './ColorPicker';

const meta = {
  title: 'Shared UI/ColorPicker'
} satisfies Meta;

export default meta;

export const Default: StoryObj = {
  render: () => {
    const [color, setColor] = useState<ColorPickerColor | null>(null);
    return (
      <div className="flex flex-col gap-4">
        <ColorPicker value={color} onChange={setColor} />
        <p className="text-muted-foreground text-sm">
          Selected: {color ?? 'none'}
        </p>
      </div>
    );
  }
};

export const WithPreselected: StoryObj = {
  name: 'Pre-selected color',
  render: () => {
    const [color, setColor] = useState<ColorPickerColor | null>('teal-500');
    return (
      <div className="flex flex-col gap-4">
        <ColorPicker value={color} onChange={setColor} />
        <p className="text-muted-foreground text-sm">
          Selected: {color ?? 'none'}
        </p>
      </div>
    );
  }
};

export const SmallTrigger: StoryObj = {
  name: 'Small trigger button',
  render: () => {
    const [color, setColor] = useState<ColorPickerColor | null>(null);
    return (
      <ColorPicker
        value={color}
        onChange={setColor}
        trigger={{ buttonSize: 'sm', labelSelect: 'Color' }}
      />
    );
  }
};

export const CustomLabels: StoryObj = {
  name: 'Custom labels',
  render: () => {
    const [color, setColor] = useState<ColorPickerColor | null>(null);
    return (
      <ColorPicker
        value={color}
        onChange={setColor}
        labels={{
          searchFieldPlaceholder: 'Filter colors…',
          noColorsFound: 'No match'
        }}
        trigger={{ labelSelect: 'Choose brand color' }}
      />
    );
  }
};

export const FrostLight = a11yStory(Default, 'frost', 'light');
export const FrostDark = a11yStory(Default, 'frost', 'dark');
export const PayloadAdminLight = a11yStory(Default, 'payload-admin', 'light');
export const PayloadAdminDark = a11yStory(Default, 'payload-admin', 'dark');
export const SpotlightLight = a11yStory(Default, 'spotlight', 'light');
export const SpotlightDark = a11yStory(Default, 'spotlight', 'dark');
export const CodewareLight = a11yStory(Default, 'codeware', 'light');
export const CodewareDark = a11yStory(Default, 'codeware', 'dark');
