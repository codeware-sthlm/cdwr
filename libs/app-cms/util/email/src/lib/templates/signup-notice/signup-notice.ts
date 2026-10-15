import { type SupportedLocale, t } from '@codeware/shared/util/i18n';

import { type EmailBrand, renderEmailLayout } from '../layout';

export type SignupNoticeMailInput = {
  locale: SupportedLocale;
  tenantName: string;
  /** Name of the deployment serving the new workspace */
  deployment: string;
  userName: string;
  userEmail: string;
  /** Environment the platform runs in; anything but production is provisioned as a preview */
  environment: 'development' | 'preview' | 'production';
  /** Fly app serving this platform, named in a preview command when known */
  appName?: string;
  /** Absolute link to the new tenant in the admin */
  adminUrl: string;
  /** Header with logo and accent; omitted for a plain mail */
  brand?: EmailBrand;
};

/** The `--env` flag, with `--preview-app` where it is needed and known */
const provisionTarget = (
  environment: SignupNoticeMailInput['environment'],
  appName: string | undefined
): string =>
  environment === 'production'
    ? '--env production'
    : `--env preview${appName ? ` --preview-app ${appName}` : ''}`;

/**
 * The mail the platform owner gets when someone signs up on their own.
 *
 * Carries the details so the owner can see who arrived without opening the
 * admin, and links to the tenant for when they want to.
 */
export function renderSignupNoticeMail(input: SignupNoticeMailInput): {
  subject: string;
  html: string;
  text: string;
} {
  const {
    adminUrl,
    brand,
    appName,
    deployment,
    environment,
    locale,
    tenantName,
    userEmail,
    userName
  } = input;

  const subject = t(locale, 'signupNotice.subject', { tenantName });

  const { html, text } = renderEmailLayout({
    title: subject,
    paragraphs: [
      t(locale, 'signupNotice.body'),
      t(locale, 'signupNotice.nextStep', {
        command: `cdwr tenant provision ${provisionTarget(environment, appName)} --workspace ${deployment} --apps cms`
      })
    ],
    detailsHeading: t(locale, 'signupNotice.detailsHeading'),
    details: [
      [t(locale, 'signupNotice.workspaceLabel'), tenantName],
      [t(locale, 'signupNotice.deploymentLabel'), deployment],
      [t(locale, 'signupNotice.nameLabel'), userName],
      [t(locale, 'signupNotice.emailLabel'), userEmail]
    ],
    cta: { label: t(locale, 'signupNotice.button'), url: adminUrl },
    from: brand?.name ?? 'Codeware CMS',
    brand
  });

  return { subject, html, text };
}
