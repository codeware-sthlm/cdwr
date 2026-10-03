import {
  type ComponentBuildResult,
  isComponentBuildResult
} from '@codeware/shared/util/payload-utils';

import type { ComponentBuildInput } from './run-component-build';

/** A build service that takes builds over from this process */
export type BuildService = {
  url: string;
  token: string;
};

/** Longest a build may take before it is given up on, in milliseconds */
export const REMOTE_BUILD_TIMEOUT_MS = 60_000;

const unavailable = (reason: string): ComponentBuildResult => ({
  ok: false,
  diagnostics: [
    {
      message: `The build service did not answer: ${reason}.`,
      line: 1,
      column: 1,
      severity: 'error'
    }
  ]
});

const describeError = (error: unknown): string =>
  error instanceof Error &&
  (error.name === 'TimeoutError' || error.name === 'AbortError')
    ? `no reply within ${REMOTE_BUILD_TIMEOUT_MS / 1000} seconds`
    : error instanceof Error
      ? error.message
      : String(error);

/**
 * Has the build service build the source.
 *
 * Never throws: a connection error, a timeout, an error status or an answer
 * that is not a build result comes out as a failed result with one finding.
 * A build that failed on its own terms comes back as the service's answer.
 */
export const buildRemotely = async (
  { tagName, source, propsSchema }: ComponentBuildInput,
  { url, token }: BuildService,
  fetchImpl: typeof fetch = fetch
): Promise<ComponentBuildResult> => {
  let response: Response;
  try {
    response = await fetchImpl(new URL('/build', url), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ tagName, source, propsSchema }),
      signal: AbortSignal.timeout(REMOTE_BUILD_TIMEOUT_MS)
    });
  } catch (error) {
    return unavailable(describeError(error));
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return unavailable(
      response.ok
        ? 'the reply was not JSON'
        : `status ${response.status} ${response.statusText}`.trim()
    );
  }

  if (isComponentBuildResult(body)) {
    // A failed build is a 200 with `ok: false`; the service's own 500
    // carries one diagnostic in the same shape
    return body;
  }
  return unavailable(
    response.ok
      ? 'the reply was not a build result'
      : `status ${response.status} ${response.statusText}`.trim()
  );
};
