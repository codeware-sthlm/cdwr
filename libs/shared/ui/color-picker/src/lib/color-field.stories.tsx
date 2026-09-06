import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';

import { ColorField } from './ColorField';

const meta = {
  title: 'Shared UI/ColorField'
} satisfies Meta;

export default meta;

const Row = ({
  initial,
  resolved,
  label
}: {
  initial: string;
  resolved?: string;
  label: string;
}) => {
  const [value, setValue] = useState(initial);

  return (
    <div className="flex items-center gap-3">
      <ColorField
        value={value}
        resolved={resolved}
        onChange={setValue}
        label={label}
      />
      <code className="text-xs">{label}</code>
      <code className="text-muted-foreground text-xs">{value}</code>
    </div>
  );
};

export const Default: StoryObj = {
  render: () => <Row initial="oklch(0.704 0.14 182.503)" label="--primary" />
};

export const Translucent: StoryObj = {
  name: 'A value with alpha',
  render: () => <Row initial="oklch(1 0 0 / 10%)" label="--border" />
};

/**
 * A token that points at another one.
 *
 * Both the swatch and the picker follow `resolved` — without it there would be
 * nothing to show or to seed from, since a `var()` has no colour of its own,
 * and it would resolve against whatever host the field sits in.
 */
export const Aliased: StoryObj = {
  name: 'An aliased token',
  render: () => (
    <Row
      initial="var(--primary)"
      resolved="oklch(0.45 0.18 264)"
      label="--core-nav-link-active"
    />
  )
};

/** Nothing to pick, so the swatch stays a swatch. */
export const NotAColour: StoryObj = {
  name: 'A value that is not a colour',
  render: () => <Row initial="0.625rem" label="--radius" />
};
