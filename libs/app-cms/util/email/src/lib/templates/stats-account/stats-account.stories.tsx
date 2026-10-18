import type { SupportedLocale } from '@codeware/shared/util/i18n';
import type { Meta, StoryObj } from '@storybook/react-vite';

import { PLATFORM_EMAIL_BRAND } from '../../email-brand';

import { renderStatsAccountMail } from './stats-account';

type Mail = { subject: string; html: string; text: string };

/** The mail in a document of its own, as a client shows it, plus its text part */
const MailPreview = ({ mail }: { mail: Mail }) => (
  <div className="flex w-full max-w-[46rem] flex-col gap-3">
    <div className="border-border rounded-lg border">
      <div className="text-foreground border-border border-b px-4 py-2 text-sm">
        <span className="text-muted-foreground">Subject: </span>
        {mail.subject}
      </div>
      <iframe
        srcDoc={mail.html}
        title={mail.subject}
        className="h-[26rem] w-full rounded-b-lg bg-white"
      />
    </div>
    <details className="text-muted-foreground text-xs">
      <summary className="cursor-pointer">Plain text part</summary>
      <pre className="mt-2 font-mono text-[11px] whitespace-pre-wrap">
        {mail.text}
      </pre>
    </details>
  </div>
);

type Args = { locale: SupportedLocale };

const meta: Meta<Args> = {
  title: 'App CMS/Emails/Stats account',
  argTypes: {
    locale: { control: 'radio', options: ['en', 'sv'] }
  },
  args: { locale: 'en' }
};

export default meta;
type Story = StoryObj<Args>;

const input = {
  loginUrl: 'https://stats.example.com/login',
  username: 'anna@titan.example.com',
  password: 'k3Jx9-pQm2Zw8-Rb4Tn1'
};

export const Branded: Story = {
  name: 'Tenant brand',
  render: ({ locale }) => (
    <MailPreview
      mail={renderStatsAccountMail({
        locale,
        brand: {
          name: 'Titan Tours',
          logoUrl: 'https://titan.example.com/site-icon.png?size=64',
          accent: '#8a1c1c'
        },
        ...input
      })}
    />
  )
};

export const Platform: Story = {
  name: 'Platform brand',
  render: ({ locale }) => (
    <MailPreview
      mail={renderStatsAccountMail({
        locale,
        brand: PLATFORM_EMAIL_BRAND,
        ...input
      })}
    />
  )
};
