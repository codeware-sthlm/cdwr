import { getEnv } from '@codeware/app-cms/feature/env-loader';
import { verifySignature } from '@codeware/shared/util/signature';
import type { PayloadRequest } from 'payload';

/**
 * Whether an api key identity's request may go on, as far as the request
 * signature is concerned.
 *
 * In host mode an external REST request must carry a valid signature. Internal
 * Local API calls (no `host` header) skip verification: they run in-process and
 * cannot be spoofed. Tenant mode needs no signature.
 *
 * @param req - The request to check
 * @param identity - Who is asking, for the log line on a refusal
 */
export const verifyHostSignature = (
  { headers, payload }: Pick<PayloadRequest, 'headers' | 'payload'>,
  identity: string
): boolean => {
  const { APP_MODE } = getEnv();

  if (APP_MODE.type !== 'host' || !headers.has('host')) {
    return true;
  }

  const { success, error } = verifySignature({
    headers,
    secret: APP_MODE.signatureSecrets
  });

  if (!success) {
    payload.logger.info(`${identity} denied, invalid signature:\n${error}`);
  }

  return success;
};
