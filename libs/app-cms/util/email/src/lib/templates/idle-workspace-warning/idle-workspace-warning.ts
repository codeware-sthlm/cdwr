import { type SupportedLocale, t } from '@codeware/shared/util/i18n';

import { type EmailBrand, renderEmailLayout } from '../layout';

export type IdleWorkspaceWarningMailInput = {
  locale: SupportedLocale;
  workspaceName: string;
  /** The day the workspace is deleted, unless a page is added */
  deleteOn: Date;
  /** Who the mail is from, shown as the header */
  brand: EmailBrand;
  /** Absolute link to the admin */
  adminUrl: string;
};

/**
 * The mail a workspace admin gets when the workspace has had no page since
 * signup and is about to be deleted.
 */
export function renderIdleWorkspaceWarningMail(
  input: IdleWorkspaceWarningMailInput
): { subject: string; html: string; text: string } {
  const { adminUrl, brand, deleteOn, locale, workspaceName } = input;

  const vars = {
    name: workspaceName,
    date: new Intl.DateTimeFormat(locale, {
      dateStyle: 'long',
      timeZone: 'UTC'
    }).format(deleteOn)
  };

  const subject = t(locale, 'idleWorkspaceWarning.subject', vars);

  const { html, text } = renderEmailLayout({
    title: subject,
    paragraphs: [
      t(locale, 'idleWorkspaceWarning.body', vars),
      t(locale, 'idleWorkspaceWarning.ignore')
    ],
    brand,
    cta: { label: t(locale, 'idleWorkspaceWarning.button'), url: adminUrl },
    from: brand.name
  });

  return { subject, html, text };
}
