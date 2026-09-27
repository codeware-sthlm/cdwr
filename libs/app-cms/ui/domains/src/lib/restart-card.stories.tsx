import { a11yStory } from '@codeware/shared/util/storybook';
import type { Meta, StoryObj } from '@storybook/react-vite';

import { RestartCard } from './restart-card';

const meta = {
  title: 'App CMS/Domains/RestartCard'
} satisfies Meta;

export default meta;

const hint =
  'A newly validated domain only takes effect after the app restarts.';

export const Default: StoryObj = {
  render: () => (
    <div className="flex w-full max-w-160 flex-col gap-4">
      <RestartCard
        apps={['cdwr-cms-pr-477-demo']}
        hint={hint}
        restartLabel="Restart app"
        onRestart={() => undefined}
      />
      <RestartCard
        apps={['cdwr-cms-pr-477-demo', 'cdwr-web-pr-477-demo']}
        hint={hint}
        restartLabel="Restart app"
        runningApp="cdwr-web-pr-477-demo"
        disabled
        onRestart={() => undefined}
      />
    </div>
  )
};

export const PayloadAdminLight = a11yStory(Default, 'payload-admin', 'light');
export const PayloadAdminDark = a11yStory(Default, 'payload-admin', 'dark');
export const FrostLight = a11yStory(Default, 'frost', 'light');
export const FrostDark = a11yStory(Default, 'frost', 'dark');
