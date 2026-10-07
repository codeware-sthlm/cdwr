import { FlyApi } from '@cdwr/fly-node/api';
import {
  clearIntegrationCredentials,
  getIntegrationCredentials
} from '@codeware/shared/feature/infisical';

/** Infisical folder holding the Fly credentials */
const PROVIDER = 'fly';

/** Secret that authenticates every Fly api call */
const TOKEN_KEY = 'API_TOKEN';

/** A Fly client, or why there is none */
export type FlyApiResult =
  | { status: 'ready'; fly: FlyApi }
  | { status: 'unconfigured' }
  | { status: 'unreachable'; error: string };

/** What an endpoint answers when there is no Fly client */
export const flyUnavailableMessage = {
  unconfigured: 'No Fly credentials are configured for this platform.',
  unreachable:
    'Could not read the Fly credentials from Infisical. Try again in a moment.'
} as const satisfies Record<Exclude<FlyApiResult['status'], 'ready'>, string>;

const readToken = async (): Promise<string | undefined> => {
  const credentials = await getIntegrationCredentials(PROVIDER, {
    environment: process.env['DEPLOY_ENV']
  });

  return credentials[TOKEN_KEY];
};

/**
 * A Fly client for managing tenant certificates, or the reason there is none.
 *
 * Custom domains are optional infrastructure: a workspace running without the
 * integration configured should still boot, still serve, and still show its
 * domains panel - explaining that the platform cannot reach Fly yet.
 *
 * The token is org-scoped, so one client covers every tenant's app. It is read
 * from Infisical on demand, see `getIntegrationCredentials`. That lib caches an
 * empty answer, so a missing token is read once more from fresh; this is only
 * paid on a click, never on page render.
 *
 * Never throws: a broken secret store is `unreachable`, never `unconfigured`.
 */
export const getFlyApi = async (): Promise<FlyApiResult> => {
  try {
    let token = await readToken();

    if (!token) {
      clearIntegrationCredentials(PROVIDER);
      token = await readToken();
    }

    return token
      ? { status: 'ready', fly: new FlyApi({ token }) }
      : { status: 'unconfigured' };
  } catch (error) {
    return {
      status: 'unreachable',
      error: error instanceof Error ? error.message : String(error)
    };
  }
};
