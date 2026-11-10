/**
 * A tour left through "Show me" for another page: the step it stood on. The
 * page shows a card that offers to continue from there.
 *
 * Kept in session storage, so it survives the navigation and a reload, and
 * read through {@link subscribeTourPause} and {@link getTourPause} with
 * `useSyncExternalStore`: the server has no storage and renders no card.
 *
 * Session storage outlives a logout, so the pause names the user who left it,
 * and nobody else sees it.
 */
export type TourPause = { step: number; user: string };

/** Session storage key of the pause. */
export const TOUR_PAUSE_KEY = 'cdwr:tour-paused';

const listeners = new Set<() => void>();

// The snapshot must stay the same object while the stored value is unchanged
let cache: { raw: string | null; pause: TourPause | undefined } = {
  raw: null,
  pause: undefined
};

/** Reads a stored pause; anything not written by {@link setTourPause} is none. */
export const parseTourPause = (raw: string | null): TourPause | undefined => {
  try {
    const value: unknown = JSON.parse(raw ?? '');
    if (
      typeof value === 'object' &&
      value !== null &&
      'step' in value &&
      Number.isInteger(value.step) &&
      (value.step as number) >= 0 &&
      'user' in value &&
      typeof value.user === 'string' &&
      value.user !== ''
    ) {
      return { step: value.step as number, user: value.user };
    }
  } catch {
    // Nothing stored, or not ours
  }
  return undefined;
};

const readRaw = (): string | null => {
  try {
    return window.sessionStorage.getItem(TOUR_PAUSE_KEY);
  } catch {
    return null;
  }
};

/** The pause `user` left, or `undefined`; another user's pause is none. */
export const getTourPause = (
  user: string | undefined
): TourPause | undefined => {
  const raw = readRaw();
  if (raw !== cache.raw) {
    cache = { raw, pause: parseTourPause(raw) };
  }
  return user !== undefined && cache.pause?.user === user
    ? cache.pause
    : undefined;
};

/** Stores a pause, or clears it with `undefined`, and tells the subscribers. */
export const setTourPause = (pause: TourPause | undefined): void => {
  try {
    if (pause) {
      window.sessionStorage.setItem(TOUR_PAUSE_KEY, JSON.stringify(pause));
    } else {
      window.sessionStorage.removeItem(TOUR_PAUSE_KEY);
    }
  } catch {
    // Storage refused (private mode, quota): no card, the tour just ends
  }
  for (const listener of listeners) {
    listener();
  }
};

/** Subscribes to pause changes; returns the unsubscribe. */
export const subscribeTourPause = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
