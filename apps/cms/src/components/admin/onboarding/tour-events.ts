/**
 * Custom event that opens the onboarding tour from anywhere in the admin:
 * the command palette, the help drawer, or the dashboard's first visit.
 */
export const OPEN_TOUR_EVENT = 'cdwr:open-tour';

/** An open request no mounted tour has taken yet. */
let pending = false;

/**
 * Opens the onboarding tour. The request is also kept until the tour takes
 * it, so a tour that mounts after the dashboard asked still opens.
 */
export const openTour = () => {
  pending = true;
  window.dispatchEvent(new CustomEvent(OPEN_TOUR_EVENT));
};

/** Takes the pending open request; `true` at most once per {@link openTour}. */
export const takePendingTour = (): boolean => {
  const requested = pending;
  pending = false;
  return requested;
};
