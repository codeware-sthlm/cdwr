import {
  type UmamiCalls,
  type UmamiTeamRole,
  type UmamiUser,
  type UmamiUserRole,
  clearUmamiTokens,
  createUmamiCalls,
  createUmamiSession
} from '@codeware/shared/util/umami';

export type { UmamiTeamRole, UmamiUser, UmamiUserRole };

/** Forgets every cached login token */
export const clearUmamiAdminTokens = clearUmamiTokens;

export type UmamiAdminClient = Pick<
  UmamiCalls,
  | 'createUser'
  | 'getUser'
  | 'setPassword'
  | 'addTeamUser'
  | 'removeTeamUser'
  | 'deleteUser'
>;

type UmamiAdminClientOptions = {
  baseUrl: string;
  /** An Umami admin user without 2FA: Umami refuses API keys on user routes */
  username: string;
  password: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

/** An Umami client that manages users and team members; every answer is checked */
export const createUmamiAdminClient = ({
  baseUrl,
  username,
  password,
  fetchImpl = fetch,
  timeoutMs = 5000
}: UmamiAdminClientOptions): UmamiAdminClient => {
  const { request } = createUmamiSession({
    url: baseUrl,
    username,
    password,
    timeoutMs,
    consumer: 'the cms',
    fetchImpl
  });
  const {
    createUser,
    getUser,
    setPassword,
    addTeamUser,
    removeTeamUser,
    deleteUser
  } = createUmamiCalls(request);

  return {
    createUser,
    getUser,
    setPassword,
    addTeamUser,
    removeTeamUser,
    deleteUser
  };
};
