/**
 * Whether a `Next-Action` header holds an id Next could have built.
 *
 * Next 16 ids are 42 hex characters (`SERVER_REFERENCE_ID_LENGTH` in
 * `next/dist/shared/lib/server-reference-info`). Scanners probing for
 * React2Shell send `Next-Action: x`, which Next reports as a missing action
 * and Sentry records as an error. A well-formed id that the build doesn't know
 * is a tab left open across a deploy, so that one still reaches Next.
 */
export const isWellFormedActionId = (id: string): boolean =>
  /^[0-9a-f]{42}$/i.test(id);

/** Set by Next on the response to an action id the server doesn't know. */
export const ACTION_NOT_FOUND_HEADER = 'x-nextjs-action-not-found';

type ReloadTarget = {
  fetch: typeof fetch;
  location: Pick<Location, 'reload'>;
  sessionStorage: Pick<Storage, 'getItem' | 'setItem'>;
};

const RELOAD_KEY = 'stale-action-reload';

/** A page that reloads into the same mismatch within this window stops. */
const RELOAD_WINDOW_MS = 60_000;

/**
 * Reload the page when a server action call hits a newer deployment.
 *
 * Payload catches the error on most of its server function calls and only
 * logs it, so the response header is the one place every stale call shows.
 * At most one reload per window, so a mismatch that outlives the reload, such
 * as a rolling deploy, doesn't loop, while a tab that outlives several deploys
 * still reloads for each.
 */
export const reloadOnStaleAction = (
  target: ReloadTarget,
  now: () => number = Date.now
): void => {
  const originalFetch = target.fetch.bind(target);

  target.fetch = async (...args) => {
    const response = await originalFetch(...args);

    if (response.headers.get(ACTION_NOT_FOUND_HEADER) === '1') {
      try {
        const last = Number(target.sessionStorage.getItem(RELOAD_KEY));
        if (!(now() - last < RELOAD_WINDOW_MS)) {
          target.sessionStorage.setItem(RELOAD_KEY, String(now()));
          target.location.reload();
        }
      } catch {
        // No storage, no guard: leave the error to Payload rather than risk a loop
      }
    }

    return response;
  };
};
