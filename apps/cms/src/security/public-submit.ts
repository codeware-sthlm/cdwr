import { getEnv } from '@codeware/app-cms/feature/env-loader';
import type { Env } from '@codeware/app-cms/util/env-schema';
import {
  type HumanCheckFields,
  guardHeaders,
  guardSubmit
} from '@codeware/shared/util/human-check';
import { verifySignature } from '@codeware/shared/util/signature';
import { type NextRequest, NextResponse } from 'next/server';

/**
 * Whether this request was signed by a first-party app forwarding a visitor.
 *
 * `apps/web` posts to these routes rather than to Payload's REST api — a
 * static route shadows the `[...slug]` catch-all — and it has already counted
 * the visitor against its own allowance, by their real address. Counting again
 * here would put every visitor of that site in one bucket, since Fly rewrites
 * `Fly-Client-IP` at its edge and the cms sees the forwarding machine.
 *
 * The signature is what makes that claim trustworthy: forging it needs the
 * secret. A request that fails verification is simply counted as usual, so the
 * worst case of getting this wrong is the throttling we already had.
 */
function isForwardedByFirstParty(request: NextRequest, env: Env | undefined) {
  if (env?.APP_MODE.type !== 'host') {
    return false;
  }

  return env.APP_MODE.signatureSecrets.some(
    (secret) =>
      secret && verifySignature({ headers: request.headers, secret }).success
  );
}

/**
 * Stand in front of a public submit endpoint.
 *
 * Every unauthenticated write the platform accepts goes through here, so the
 * endpoints cannot drift apart in what they demand. Returns the response to
 * answer with, or `null` when the submission may proceed.
 *
 * Both keys of the answer carry the same words: the site route's own client
 * reads `message`, and an external caller reads `error`.
 *
 * @param scope - What is being posted to, for the allowance and the log line
 */
export async function refuseUnlessHuman(
  request: NextRequest,
  scope: string,
  fields: HumanCheckFields | undefined
): Promise<NextResponse | null> {
  const env = getEnv(false);

  const guard = await guardSubmit({
    fields: fields ?? {},
    forwarded: isForwardedByFirstParty(request, env),
    headers: request.headers,
    rateLimit: { limit: env?.HUMAN_CHECK_RATE_LIMIT },
    scope,
    secretKey: env?.HUMAN_CHECK?.secretKey
  });

  if (guard.ok) {
    return null;
  }

  return NextResponse.json(
    { error: guard.message, message: guard.message },
    { status: guard.status, headers: guardHeaders(guard) }
  );
}
