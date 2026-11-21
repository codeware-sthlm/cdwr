import { a11yStory } from '@codeware/shared/util/storybook';
import type { Meta, StoryObj } from '@storybook/react-vite';

import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldSeparator
} from './field';
import { Input } from './input';

const meta = {
  title: 'Shadcn/Field'
} satisfies Meta;

export default meta;

export const Demo: StoryObj = {
  render: () => (
    <FieldGroup className="w-80">
      <Field>
        <FieldLabel htmlFor="field-demo-email">Email</FieldLabel>
        <Input id="field-demo-email" type="email" placeholder="Email" />
        <FieldDescription>We never share your address.</FieldDescription>
      </Field>
      <Field data-invalid>
        <FieldLabel htmlFor="field-demo-password">Password</FieldLabel>
        <Input id="field-demo-password" type="password" aria-invalid />
        <FieldError>Use at least 10 characters.</FieldError>
      </Field>
      <FieldSeparator>Or</FieldSeparator>
      <Field>
        <FieldLabel htmlFor="field-demo-disabled">Disabled</FieldLabel>
        <Input id="field-demo-disabled" disabled placeholder="Disabled" />
      </Field>
    </FieldGroup>
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
