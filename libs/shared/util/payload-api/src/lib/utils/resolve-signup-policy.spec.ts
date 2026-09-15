import type { SiteSetting } from '@codeware/shared/util/payload-types';
import { describe, expect, it } from 'vitest';

import { resolveSignupPolicy } from './resolve-signup-policy';

type Config = {
  privacyPage?: unknown;
  termsPage?: unknown;
  retentionDays?: unknown;
};

/** The pages live under `legal`, the retention under `tourSignups` */
const settings = (config: Config | undefined) =>
  ({
    legal: config && {
      privacyPage: config.privacyPage,
      termsPage: config.termsPage
    },
    tourSignups: config && { retentionDays: config.retentionDays }
  }) as unknown as SiteSetting;

describe('resolveSignupPolicy', () => {
  it('resolves both pages to paths', () => {
    expect(
      resolveSignupPolicy(
        settings({
          privacyPage: { id: 1, slug: 'privacy' },
          termsPage: { id: 2, slug: 'terms' },
          retentionDays: 180
        })
      )
    ).toEqual({
      privacyUrl: '/privacy',
      termsUrl: '/terms',
      retentionDays: 180
    });
  });

  it('drops a relation that was fetched without depth', () => {
    // An id alone cannot be linked to, and a broken link is worse than none
    expect(
      resolveSignupPolicy(settings({ privacyPage: 1, termsPage: 2 }))
    ).toEqual({ privacyUrl: null, termsUrl: null, retentionDays: null });
  });

  it('drops a page that has lost its slug', () => {
    expect(
      resolveSignupPolicy(settings({ privacyPage: { id: 1, slug: '' } }))
        .privacyUrl
    ).toBeNull();
  });

  it('answers for a workspace that has configured nothing', () => {
    // The form still states what it collects, so this is a valid state
    expect(resolveSignupPolicy(null)).toEqual({
      privacyUrl: null,
      termsUrl: null,
      retentionDays: null
    });
    expect(resolveSignupPolicy(settings(undefined))).toEqual({
      privacyUrl: null,
      termsUrl: null,
      retentionDays: null
    });
  });
});
