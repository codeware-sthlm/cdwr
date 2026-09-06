import { a11yStory } from '@codeware/shared/util/storybook';
import type { Meta, StoryObj } from '@storybook/react-vite';

import { Button } from './button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from './card';
import { Input } from './input';
import { Label } from './label';

const meta = {
  title: 'Shadcn/Card'
} satisfies Meta;

export default meta;

export const Demo: StoryObj = {
  render: () => (
    <Card className="w-96">
      <CardHeader>
        <CardTitle>Login to your account</CardTitle>
        <CardDescription>
          Enter your email below to login to your account
        </CardDescription>
        <CardAction>
          <Button variant="link">Sign up</Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-2">
          <Label htmlFor="card-demo-email">Email</Label>
          <Input
            id="card-demo-email"
            type="email"
            placeholder="m@example.com"
          />
        </div>
      </CardContent>
      <CardFooter className="justify-end gap-2">
        <Button variant="outline">Cancel</Button>
        <Button>Login</Button>
      </CardFooter>
    </Card>
  )
};

export const SmallSize: StoryObj = {
  render: () => (
    <Card size="sm" className="w-96">
      <CardHeader>
        <CardTitle>Compact card</CardTitle>
        <CardDescription>The `sm` size tightens all spacing.</CardDescription>
      </CardHeader>
      <CardContent>Content aligns with the tighter padding.</CardContent>
    </Card>
  )
};

/**
 * What the Payload admin renders.
 *
 * Payload's own card is bordered, so the admin matches its chrome rather than
 * shadcn's ring-first default. Hover the second one: `interactive` marks a card
 * that is itself the click target, and takes its colour from
 * `--core-interactive` so each theme decides how loud that is.
 */
export const Bordered: StoryObj = {
  render: () => (
    <div className="flex flex-col gap-4">
      <Card variant="bordered" className="w-96">
        <CardHeader>
          <CardTitle>Bordered</CardTitle>
          <CardDescription>Border and shadow, no ring.</CardDescription>
        </CardHeader>
        <CardContent>Static — nothing to click.</CardContent>
      </Card>

      <Card variant="bordered" interactive className="w-96">
        <CardHeader>
          <CardTitle>Bordered and interactive</CardTitle>
          <CardDescription>
            The border and shadow answer on hover and on focus within.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" size="sm">
            Tab to me
          </Button>
        </CardContent>
      </Card>
    </div>
  )
};

export const ShadcnLight = a11yStory(Demo, 'shadcn', 'light');
export const ShadcnDark = a11yStory(Demo, 'shadcn', 'dark');
export const PayloadAdminLight = a11yStory(Demo, 'payload-admin', 'light');
export const PayloadAdminDark = a11yStory(Demo, 'payload-admin', 'dark');
export const SpotlightLight = a11yStory(Demo, 'spotlight', 'light');
export const SpotlightDark = a11yStory(Demo, 'spotlight', 'dark');
export const CodewareLight = a11yStory(Demo, 'codeware', 'light');
export const CodewareDark = a11yStory(Demo, 'codeware', 'dark');
export const BorderedShadcnLight = a11yStory(Bordered, 'shadcn', 'light');
export const BorderedPayloadAdminLight = a11yStory(
  Bordered,
  'payload-admin',
  'light'
);
export const BorderedSpotlightLight = a11yStory(Bordered, 'spotlight', 'light');
