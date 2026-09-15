import type { SiteSetting } from '@codeware/shared/util/payload-types';

/** What the signup form has to tell a customer about their details */
export type SignupPolicy = {
  /** Path to the workspace's privacy page, when it has one */
  privacyUrl: string | null;
  /** Path to the terms page; when set, acceptance is required to sign up */
  termsUrl: string | null;
  /** Days after departure the personal details are kept */
  retentionDays: number | null;
};

/** A page relation resolves to a path only when it was fetched with depth */
const toPath = (value: unknown): string | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const slug = (value as { slug?: unknown }).slug;
  return typeof slug === 'string' && slug ? `/${slug}` : null;
};

/**
 * Resolve what a tour signup form must disclose, from site settings.
 *
 * Both apps render the same form and both have site settings to hand, so the
 * resolving happens once here rather than twice in slightly different ways.
 *
 * Missing pages are not an error: the form still states what is collected and
 * for how long, since the lawful basis for a booking is performing it rather
 * than consent. A missing terms page simply means nothing to accept.
 */
export function resolveSignupPolicy(
  siteSettings: SiteSetting | null | undefined
): SignupPolicy {
  const legal = siteSettings?.legal;

  return {
    privacyUrl: toPath(legal?.privacyPage),
    termsUrl: toPath(legal?.termsPage),
    retentionDays: siteSettings?.tourSignups?.retentionDays ?? null
  };
}
