import { a11yStory } from '@codeware/shared/util/storybook';
import {
  CubeIcon,
  EnvelopeIcon,
  PuzzlePieceIcon,
  ShieldCheckIcon
} from '@heroicons/react/24/outline';
import type { Meta, StoryObj } from '@storybook/react-vite';

import { StatusWidget } from './status-widget';

const meta = {
  title: 'App CMS/Dashboard/StatusWidget'
} satisfies Meta;

export default meta;

/** The grid the platform tab lays these out in */
const Grid = ({ children }: { children: React.ReactNode }) => (
  <div className="grid w-full max-w-320 grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
    {children}
  </div>
);

/**
 * Every tone side by side.
 *
 * The point of the design is visible here: only the icon carries colour, so a
 * row of widgets stays scannable instead of reading as a traffic light.
 */
export const Tones: StoryObj = {
  render: () => (
    <Grid>
      <StatusWidget
        icon={ShieldCheckIcon}
        tone="ok"
        title="Domains & certificates"
        metric="8 domains"
        detail="All certificates active"
        openLabel="Show every domain"
        onOpen={() => undefined}
      />
      <StatusWidget
        icon={ShieldCheckIcon}
        tone="warning"
        title="Domains & certificates"
        metric="8 domains"
        detail="2 waiting for DNS"
        openLabel="Show every domain"
        onOpen={() => undefined}
      />
      <StatusWidget
        icon={ShieldCheckIcon}
        tone="error"
        title="Domains & certificates"
        metric="8 domains"
        detail="1 paused by the certificate authority"
        openLabel="Show every domain"
        onOpen={() => undefined}
      />
      <StatusWidget
        icon={ShieldCheckIcon}
        tone="neutral"
        title="Domains & certificates"
        metric="0 domains"
        detail="No custom domains configured"
      />
    </Grid>
  )
};

/** The panel as it reads on a healthy platform — nothing asking to be read */
export const HealthyPanel: StoryObj = {
  render: () => (
    <Grid>
      <StatusWidget
        icon={ShieldCheckIcon}
        tone="ok"
        title="Domains & certificates"
        metric="8 domains"
        detail="All certificates active"
        openLabel="Show every domain"
        onOpen={() => undefined}
      />
      <StatusWidget
        icon={PuzzlePieceIcon}
        tone="ok"
        title="Integrations"
        metric="3 of 3 set up"
        detail="Email, error tracking and storage all set up"
        openLabel="Show every integration"
        onOpen={() => undefined}
      />
      <StatusWidget
        icon={EnvelopeIcon}
        tone="ok"
        title="Mail delivery"
        metric="12 notifications this week"
        detail="All notifications delivered"
      />
      <StatusWidget
        icon={CubeIcon}
        tone="neutral"
        title="Environment & build"
        metric="1.12.0"
        detail="production · host · ab12cd3"
      />
    </Grid>
  )
};

/** One widget with something to say, which is the case the design exists for */
export const SomethingWrong: StoryObj = {
  render: () => (
    <Grid>
      <StatusWidget
        icon={ShieldCheckIcon}
        tone="ok"
        title="Domains & certificates"
        metric="8 domains"
        detail="All certificates active"
        openLabel="Show every domain"
        onOpen={() => undefined}
      />
      <StatusWidget
        icon={PuzzlePieceIcon}
        tone="error"
        title="Integrations"
        metric="2 of 3 set up"
        detail="Email is going to a test inbox, not to the people it is addressed to"
        openLabel="Show every integration"
        onOpen={() => undefined}
      />
      <StatusWidget
        icon={EnvelopeIcon}
        tone="error"
        title="Mail delivery"
        metric="14 notifications this week"
        detail="3 failed to send"
        openLabel="Show every failure"
        onOpen={() => undefined}
      />
      <StatusWidget
        icon={CubeIcon}
        tone="warning"
        title="Environment & build"
        metric="1.12.0"
        detail="Running in production without a commit or build time — this build cannot be traced back to a commit."
      />
    </Grid>
  )
};

/**
 * Uneven detail lengths in one row.
 *
 * The widgets have to end level: the long detail sets the row height and the
 * short ones stretch to it, rather than each card sitting at its own height.
 */
export const UnevenContent: StoryObj = {
  render: () => (
    <Grid>
      <StatusWidget
        icon={ShieldCheckIcon}
        tone="ok"
        title="Domains & certificates"
        metric="8 domains"
        detail="All certificates active"
        openLabel="Show every domain"
        onOpen={() => undefined}
      />
      <StatusWidget
        icon={PuzzlePieceIcon}
        tone="error"
        title="Integrations"
        metric="2 of 3 set up"
        detail="Email is going to a test inbox, not to the people it is addressed to"
        openLabel="Show every integration"
        onOpen={() => undefined}
      />
      <StatusWidget
        icon={EnvelopeIcon}
        tone="neutral"
        title="Mail delivery"
        metric="0 notifications this week"
        detail="No notifications sent this week"
      />
      <StatusWidget
        icon={CubeIcon}
        tone="neutral"
        title="Environment & build"
        metric="1.12.0"
        detail="production · host"
      />
    </Grid>
  )
};

export const UnevenAdminLight = a11yStory(
  UnevenContent,
  'payload-admin',
  'light'
);
export const PayloadAdminLight = a11yStory(Tones, 'payload-admin', 'light');
export const PayloadAdminDark = a11yStory(Tones, 'payload-admin', 'dark');
export const FrostLight = a11yStory(Tones, 'frost', 'light');
export const FrostDark = a11yStory(Tones, 'frost', 'dark');
