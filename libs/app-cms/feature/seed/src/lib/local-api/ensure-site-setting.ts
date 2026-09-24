import { getId } from '@codeware/app-cms/util/misc';
import type { SiteSetting } from '@codeware/shared/util/payload-types';
import type { Payload, TypedLocale } from 'payload';

export type SiteSettingData = Pick<
  SiteSetting,
  'footer' | 'forms' | 'general' | 'legal' | 'tenant'
>;

/**
 * Ensure that a site setting exist with the given tenant.
 *
 * Update general, footer and forms setting values when missing.
 *
 * @param payload - Payload instance
 * @param data - Site setting data
 * @param options - Seed options
 * @returns The site setting ID if exists or the object when created, otherwise undefined
 */
export async function ensureSiteSetting(
  payload: Payload,
  data: SiteSettingData,
  options: { locale: TypedLocale; transactionID: string | number | undefined }
): Promise<SiteSetting | number> {
  const { locale, transactionID } = options;
  const {
    footer: footerFromProps,
    forms: formsFromProps,
    general: generalFromProps,
    legal: legalFromProps,
    tenant
  } = data;

  if (!tenant) {
    throw new Error('Tenant is required');
  }

  // Check if the site setting exists with the given tenant
  const siteSettings = await payload.find({
    collection: 'site-settings',
    where: {
      tenant: { in: [getId(tenant)] }
    },
    depth: 0,
    limit: 1,
    req: { transactionID }
  });

  if (siteSettings.totalDocs) {
    const { footer, forms, general, id, legal } = siteSettings.docs[0];

    // Footer columns have database defaults, so a footer left untouched still
    // has values — seeded content is what tells the two apart
    const hasFooterContent = !!footer?.tagline || !!footer?.contact?.length;
    // Without this, the seeded contact form's own empty `emailTo` — deliberate,
    // to exercise the fallback chain — has nowhere to fall back to, and
    // `requireResolvableRecipient` refuses to save it
    const hasFormsContent = !!forms?.notificationRecipients?.length;

    // Legal pages count too: without them a definition that adds a privacy
    // or terms page is silently ignored on an already-seeded workspace
    const hasLegalContent =
      !legalFromProps ||
      ((!legalFromProps.privacyPage || !!legal?.privacyPage) &&
        (!legalFromProps.termsPage || !!legal?.termsPage));

    if (
      general.appName &&
      general.landingPage &&
      hasFooterContent &&
      hasFormsContent &&
      hasLegalContent
    ) {
      return id;
    }

    // Update missing values
    await payload.update({
      collection: 'site-settings',
      id,
      data: {
        footer: {
          ...footer,
          contact: footer?.contact?.length
            ? footer.contact
            : footerFromProps?.contact,
          showVersion: footer?.showVersion ?? footerFromProps?.showVersion,
          tagline: footer?.tagline ?? footerFromProps?.tagline,
          variant: footer?.variant ?? footerFromProps?.variant
        },
        forms: {
          ...forms,
          notificationRecipients: forms?.notificationRecipients?.length
            ? forms.notificationRecipients
            : formsFromProps?.notificationRecipients
        },
        legal: {
          ...legal,
          privacyPage: legal?.privacyPage ?? legalFromProps?.privacyPage,
          termsPage: legal?.termsPage ?? legalFromProps?.termsPage
        },
        general: {
          ...general,
          appName: general.appName ?? generalFromProps.appName,
          icon: general.icon ?? generalFromProps.icon,
          landingPage: general.landingPage ?? generalFromProps.landingPage
        }
      },
      locale,
      // Without this the write escapes the caller's transaction, so a dry-run
      // apply would persist settings that the rollback cannot take back
      req: { transactionID }
    });

    return id;
  }

  // No site setting found, create one

  const newSiteSetting = await payload.create({
    collection: 'site-settings',
    data: {
      footer: footerFromProps,
      forms: formsFromProps,
      general: generalFromProps,
      legal: legalFromProps,
      tenant
    },
    locale,
    req: { transactionID }
  });

  return newSiteSetting;
}
