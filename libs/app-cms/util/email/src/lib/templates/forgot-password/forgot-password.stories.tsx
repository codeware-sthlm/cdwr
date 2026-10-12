import type { SupportedLocale } from '@codeware/shared/util/i18n';
import type { Meta, StoryObj } from '@storybook/react-vite';

import { PLATFORM_EMAIL_BRAND } from '../../email-brand';

import { renderForgotPasswordMail } from './forgot-password';

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
  title: 'App CMS/Emails/Forgot password',
  argTypes: {
    locale: { control: 'radio', options: ['en', 'sv'] }
  },
  args: { locale: 'en' }
};

export default meta;
type Story = StoryObj<Args>;

const resetUrl = 'https://titan.example.com/admin/reset/abc123';

export const Branded: Story = {
  name: 'Tenant brand',
  render: ({ locale }) => (
    <MailPreview
      mail={renderForgotPasswordMail({
        locale,
        brand: {
          name: 'Titan Tours',
          logoUrl: 'https://titan.example.com/site-icon.png?size=64',
          accent: '#8a1c1c'
        },
        resetUrl,
        name: 'Anna Berg'
      })}
    />
  )
};

export const Platform: Story = {
  name: 'Platform brand, no name',
  render: ({ locale }) => (
    <MailPreview
      mail={renderForgotPasswordMail({
        locale,
        brand: PLATFORM_EMAIL_BRAND,
        resetUrl
      })}
    />
  )
};
