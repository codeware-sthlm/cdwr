import { a11yStory } from '@codeware/shared/util/storybook';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { userEvent, within } from 'storybook/test';

import { SiteStatsAccountAction } from './site-stats-account-action';

const meta = {
  title: 'App CMS/Dashboard/SiteStatsAccountAction'
} satisfies Meta;

export default meta;

type Labels = React.ComponentProps<typeof SiteStatsAccountAction>['labels'];

const en: Labels = {
  get: 'Get a statistics login',
  getBody:
    'A login to the statistics in Umami is created for you. The username and password are emailed to your address.',
  reset: 'Reset my statistics password',
  resetBody:
    'Your password to the statistics in Umami is replaced by a new one, emailed to your address. The old password stops working.',
  cancel: 'Cancel',
  confirm: 'Email me the login'
};

const sv: Labels = {
  get: 'Skaffa en inloggning till statistiken',
  getBody:
    'En inloggning till statistiken i Umami skapas åt dig. Användarnamn och lösenord mejlas till din e-postadress.',
  reset: 'Återställ mitt lösenord till statistiken',
  resetBody:
    'Ditt lösenord till statistiken i Umami ersätts av ett nytt, som mejlas till din e-postadress. Det gamla lösenordet slutar fungera.',
  cancel: 'Avbryt',
  confirm: 'Mejla inloggningen till mig'
};

const open: StoryObj['play'] = async ({ canvasElement }) => {
  await userEvent.click(await within(canvasElement).findByRole('button'));
};

const render = (account: 'available' | 'ready', labels: Labels) => () => (
  <SiteStatsAccountAction
    account={account}
    onConfirm={async () => undefined}
    labels={labels}
  />
);

/** The confirm dialog for a first login, open */
export const GetLogin: StoryObj = {
  render: render('available', en),
  play: open
};

/** The confirm dialog for a new password, open */
export const ResetPassword: StoryObj = {
  render: render('ready', en),
  play: open
};

/** Swedish runs longer than English */
export const GetLoginSv: StoryObj = {
  render: render('available', sv),
  play: open
};

export const GetLoginLight = a11yStory(GetLogin, 'payload-admin', 'light');
export const GetLoginDark = a11yStory(GetLogin, 'payload-admin', 'dark');
export const ResetPasswordLight = a11yStory(
  ResetPassword,
  'payload-admin',
  'light'
);
export const ResetPasswordDark = a11yStory(
  ResetPassword,
  'payload-admin',
  'dark'
);
export const GetLoginSvLight = a11yStory(GetLoginSv, 'payload-admin', 'light');
export const GetLoginSvDark = a11yStory(GetLoginSv, 'payload-admin', 'dark');
