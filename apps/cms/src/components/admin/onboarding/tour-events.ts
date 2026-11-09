/**
 * Custom event that opens the onboarding tour from anywhere in the admin:
 * the command palette, the help drawer, or the dashboard's first visit.
 */
export const OPEN_TOUR_EVENT = 'cdwr:open-tour';

/** Opens the onboarding tour. */
export const openTour = () => {
  window.dispatchEvent(new CustomEvent(OPEN_TOUR_EVENT));
};
