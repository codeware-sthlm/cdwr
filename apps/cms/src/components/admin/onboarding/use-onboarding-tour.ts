'use client';

import type { User } from '@codeware/shared/util/payload-types';
import { useAuth, usePreferences } from '@payloadcms/ui';
import { useEffect } from 'react';

import {
  ONBOARDING_PREFERENCES_KEY,
  type OnboardingPreferences,
  shouldAutoOpenTour
} from './onboarding-preferences';
import { openTour } from './tour-events';

/**
 * Opens the onboarding tour once on the dashboard, whatever tab it opens on, for
 * a user who hasn't seen it (see {@link shouldAutoOpenTour}).
 *
 * Payload's `getPreference` resolves a refused read as "nothing stored", so a
 * read that fails on the server opens the tour too. Every way out of the tour
 * writes the preference, so it stays closed once a read succeeds again.
 *
 * @param showBuildSite - Whether the dashboard is asking for a first site.
 */
export function useOnboardingTour(showBuildSite: boolean): void {
  const { user } = useAuth<User>();
  const { getPreference } = usePreferences();
  const role = user?.role;

  useEffect(() => {
    let cancelled = false;
    getPreference<OnboardingPreferences>(ONBOARDING_PREFERENCES_KEY)
      .then((preferences) => {
        if (
          !cancelled &&
          shouldAutoOpenTour({
            preferences: preferences ?? undefined,
            role,
            showBuildSite
          })
        ) {
          openTour();
        }
      })
      .catch(() => undefined);
    return () => {
      // The tab unmounted before the preferences loaded
      cancelled = true;
    };
  }, [getPreference, role, showBuildSite]);
}
