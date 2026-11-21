import type { User } from '@codeware/shared/util/payload-types';

/** Payload user-preferences key the onboarding tour stores its state under. */
export const ONBOARDING_PREFERENCES_KEY = 'admin-onboarding';

/** Shape of the JSON payload stored under {@link ONBOARDING_PREFERENCES_KEY}. */
export type OnboardingPreferences = {
  /** ISO time the tour was last closed, skipped or finished. */
  tourSeenAt?: string;
};

/**
 * Whether the dashboard Home tab opens the tour by itself.
 *
 * Only for a signed-in user who isn't a system user and hasn't seen the tour,
 * and never over the first-site guide of an empty workspace: the tour waits
 * for a later visit, so the two prompts don't compete.
 *
 * @param preferences - The stored preferences; `undefined` when none are stored.
 */
export const shouldAutoOpenTour = ({
  preferences,
  role,
  showBuildSite
}: {
  preferences: OnboardingPreferences | undefined;
  role: User['role'] | undefined;
  showBuildSite: boolean;
}): boolean =>
  role !== undefined &&
  role !== 'system-user' &&
  !showBuildSite &&
  !preferences?.tourSeenAt;
