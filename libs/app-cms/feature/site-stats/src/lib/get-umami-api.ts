import { getIntegrationCredentials } from '@codeware/shared/feature/infisical';

import {
  type UmamiAdminClient,
  createUmamiAdminClient
} from './umami-admin-client';
import { type UmamiClient, createUmamiClient } from './umami-client';

/** Infisical folder holding the Umami credentials */
const PROVIDER = 'umami';

/** Secret that authenticates every Umami api call */
const KEY = 'API_KEY';

/** Secrets of the Umami admin user that manages users and teams; never used to read statistics */
const ADMIN_USERNAME = 'UMAMI_ADMIN_USERNAME';
const ADMIN_PASSWORD = 'UMAMI_ADMIN_PASSWORD';

/** An Umami client, or why there is none */
export type UmamiApiResult =
  | { status: 'ready'; umami: UmamiClient }
  | { status: 'unconfigured' }
  | { status: 'unreachable'; error: string };

const readKey = async (key: string): Promise<string | undefined> => {
  const credentials = await getIntegrationCredentials(PROVIDER, {
    environment: process.env['DEPLOY_ENV']
  });

  return credentials[key];
};

/**
 * An Umami client for reading site statistics, or the reason there is none.
 *
 * Statistics are optional: without an Umami url the dashboard simply has
 * nothing to show, and the secret store is not even asked.
 *
 * The key is read from Infisical on demand, see `getIntegrationCredentials`.
 * Unlike Fly's token this runs on every dashboard load, so a missing key is
 * not read again from fresh: its cached empty answer expires on its own.
 *
 * Never throws: a broken secret store is `unreachable`, never `unconfigured`.
 */
export const getUmamiApi = async (
  umamiUrl: string | undefined
): Promise<UmamiApiResult> => {
  if (!umamiUrl) {
    return { status: 'unconfigured' };
  }

  try {
    const apiKey = await readKey(KEY);

    return apiKey
      ? {
          status: 'ready',
          umami: createUmamiClient({ baseUrl: umamiUrl, apiKey })
        }
      : { status: 'unconfigured' };
  } catch (error) {
    return {
      status: 'unreachable',
      error: error instanceof Error ? error.message : String(error)
    };
  }
};

/** An Umami admin client, or why there is none */
export type UmamiAdminApiResult =
  | { status: 'ready'; umami: UmamiAdminClient }
  | { status: 'unconfigured' }
  | { status: 'unreachable'; error: string };

/**
 * An Umami client for managing users and team members, or the reason there is none.
 *
 * Signs in with `UMAMI_ADMIN_USERNAME` and `UMAMI_ADMIN_PASSWORD` (Umami
 * refuses API keys on user routes), kept apart from the read key so a
 * statistics call can never manage users. Never throws, like `getUmamiApi`.
 */
export const getUmamiAdminApi = async (
  umamiUrl: string | undefined
): Promise<UmamiAdminApiResult> => {
  if (!umamiUrl) {
    return { status: 'unconfigured' };
  }

  try {
    const username = await readKey(ADMIN_USERNAME);
    const password = await readKey(ADMIN_PASSWORD);

    return username && password
      ? {
          status: 'ready',
          umami: createUmamiAdminClient({
            baseUrl: umamiUrl,
            username,
            password
          })
        }
      : { status: 'unconfigured' };
  } catch (error) {
    return {
      status: 'unreachable',
      error: error instanceof Error ? error.message : String(error)
    };
  }
};
