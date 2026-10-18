import { z } from 'zod';

import { UmamiError, umamiRoot } from './umami-client';

/** Umami refused to create a user because the username is taken, also by a deleted user */
export class UmamiUserExistsError extends Error {
  override readonly name = 'UmamiUserExistsError';

  constructor(readonly username: string) {
    super('Umami user already exists');
  }
}

/** Umami has no user with the given id */
export class UmamiNotFoundError extends Error {
  override readonly name = 'UmamiNotFoundError';

  constructor(readonly userId: string) {
    super('Umami user not found');
  }
}

const UserSchema = z.object({ id: z.string(), username: z.string() });

/** An Umami user */
export type UmamiUser = z.infer<typeof UserSchema>;

/** What a user may do in Umami */
export type UmamiUserRole = 'admin' | 'user' | 'view-only';

/** What a user may do in a team */
export type UmamiTeamRole = 'team-member' | 'team-view-only' | 'team-manager';

export type UmamiAdminClient = {
  createUser: (input: {
    username: string;
    password: string;
    role: UmamiUserRole;
  }) => Promise<UmamiUser>;
  /** Throws `UmamiNotFoundError` when the user does not exist */
  setPassword: (userId: string, password: string) => Promise<void>;
  /** Succeeds when the user is already a member */
  addTeamUser: (
    teamId: string,
    userId: string,
    role: UmamiTeamRole
  ) => Promise<void>;
  /** Succeeds when the user is not a member */
  removeTeamUser: (teamId: string, userId: string) => Promise<void>;
  /** Succeeds when the user is already gone */
  deleteUser: (userId: string) => Promise<void>;
};

type UmamiAdminClientOptions = {
  baseUrl: string;
  /** The admin key, never the one that reads statistics */
  apiKey: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

const WAKING_STATUSES: ReadonlyArray<number> = [502, 503, 504];

/** An Umami client that manages users and team members; every answer is checked */
export const createUmamiAdminClient = ({
  baseUrl,
  apiKey,
  fetchImpl = fetch,
  timeoutMs = 5000
}: UmamiAdminClientOptions): UmamiAdminClient => {
  const root = umamiRoot(baseUrl);

  /** Sends the call; the response is returned for the caller to judge by status */
  const send = async (
    method: 'POST' | 'DELETE',
    path: string,
    body?: Record<string, string>
  ): Promise<Response> => {
    try {
      return await fetchImpl(`${root}/api/${path}`, {
        method,
        headers: {
          authorization: `Bearer ${apiKey}`,
          accept: 'application/json',
          ...(body ? { 'content-type': 'application/json' } : {})
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(timeoutMs)
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'TimeoutError') {
        throw new UmamiError(
          `Umami ${path}: timed out after ${timeoutMs} ms`,
          'timeout'
        );
      }
      throw new UmamiError(`Umami ${path}: request failed`, 'unavailable');
    }
  };

  const refused = (path: string, response: Response) =>
    new UmamiError(
      `Umami ${path}: status ${response.status}`,
      WAKING_STATUSES.includes(response.status) ? 'unavailable' : 'refused'
    );

  /** Umami words its 400s in the body, so the text decides what the 400 meant */
  const bodyText = async (response: Response): Promise<string> => {
    try {
      return await response.text();
    } catch {
      return '';
    }
  };

  return {
    createUser: async ({ username, password, role }) => {
      const path = 'users';
      const response = await send('POST', path, { username, password, role });

      if (response.status === 400) {
        if ((await bodyText(response)).includes('User already exists')) {
          throw new UmamiUserExistsError(username);
        }
        throw refused(path, response);
      }
      if (!response.ok) {
        throw refused(path, response);
      }

      let body: unknown;
      try {
        body = await response.json();
      } catch {
        throw new UmamiError(`Umami ${path}: answer is not JSON`, 'bad-answer');
      }
      const parsed = UserSchema.safeParse(body);
      if (!parsed.success) {
        throw new UmamiError(`Umami ${path}: unexpected answer`, 'bad-answer');
      }
      return parsed.data;
    },

    setPassword: async (userId, password) => {
      const path = `users/${encodeURIComponent(userId)}`;
      const response = await send('POST', path, { password });
      if (response.status === 404) {
        throw new UmamiNotFoundError(userId);
      }
      if (!response.ok) {
        throw refused(path, response);
      }
    },

    addTeamUser: async (teamId, userId, role) => {
      const path = `teams/${encodeURIComponent(teamId)}/users`;
      const response = await send('POST', path, { userId, role });
      // Umami answers 400 for a member it already has, with no way to tell it
      // from another bad request but the wording
      if (response.status === 400) {
        if ((await bodyText(response)).toLowerCase().includes('already')) {
          return;
        }
        throw refused(path, response);
      }
      if (!response.ok) {
        throw refused(path, response);
      }
    },

    removeTeamUser: async (teamId, userId) => {
      const path = `teams/${encodeURIComponent(teamId)}/users/${encodeURIComponent(userId)}`;
      const response = await send('DELETE', path);
      if (!response.ok && response.status !== 404) {
        throw refused(path, response);
      }
    },

    deleteUser: async (userId) => {
      const path = `users/${encodeURIComponent(userId)}`;
      const response = await send('DELETE', path);
      if (!response.ok && response.status !== 404) {
        throw refused(path, response);
      }
    }
  };
};
