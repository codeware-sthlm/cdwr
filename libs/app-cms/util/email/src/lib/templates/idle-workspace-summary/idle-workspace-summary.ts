import { type SupportedLocale, t } from '@codeware/shared/util/i18n';

import { type EmailBrand, renderEmailLayout } from '../layout';

export type IdleWorkspaceSummaryMailInput = {
  locale: SupportedLocale;
  warned: Array<{ name: string; deleteOn: Date }>;
  deleted: Array<{ name: string; usersDeleted: number }>;
  /** Workspaces with provisioning traces, left for someone to deprovision */
  provisioned: Array<{ name: string }>;
  /** Workspaces due a warning that nobody could be given */
  unwarned: Array<{ name: string; reason: 'no-admin' | 'mail-failed' }>;
  /** Absolute link to the admin */
  adminUrl: string;
  /** Header with logo and accent; omitted for a plain mail */
  brand?: EmailBrand;
};

/**
 * The mail the platform owner gets after a cleanup that warned, deleted or
 * found something to deal with by hand.
 */
export function renderIdleWorkspaceSummaryMail(
  input: IdleWorkspaceSummaryMailInput
): { subject: string; html: string; text: string } {
  const { adminUrl, brand, deleted, locale, provisioned, unwarned, warned } =
    input;

  const subject = t(locale, 'idleWorkspaceSummary.subject');

  const date = new Intl.DateTimeFormat(locale, {
    dateStyle: 'long',
    timeZone: 'UTC'
  });

  const { html, text } = renderEmailLayout({
    title: subject,
    paragraphs: [t(locale, 'idleWorkspaceSummary.body')],
    detailsHeading: t(locale, 'idleWorkspaceSummary.detailsHeading'),
    details: [
      ...warned.map(({ deleteOn, name }): [string, string] => [
        name,
        t(locale, 'idleWorkspaceSummary.warned', {
          date: date.format(deleteOn)
        })
      ]),
      ...deleted.map(({ name, usersDeleted }): [string, string] => [
        name,
        t(locale, 'idleWorkspaceSummary.deleted', {
          users: String(usersDeleted)
        })
      ]),
      ...unwarned.map(({ name, reason }): [string, string] => [
        name,
        t(
          locale,
          reason === 'no-admin'
            ? 'idleWorkspaceSummary.unwarnedNoAdmin'
            : 'idleWorkspaceSummary.unwarnedMailFailed'
        )
      ]),
      ...provisioned.map(({ name }): [string, string] => [
        name,
        t(locale, 'idleWorkspaceSummary.provisioned')
      ])
    ],
    cta: { label: t(locale, 'idleWorkspaceSummary.button'), url: adminUrl },
    from: brand?.name ?? 'Codeware CMS',
    brand
  });

  return { subject, html, text };
}
