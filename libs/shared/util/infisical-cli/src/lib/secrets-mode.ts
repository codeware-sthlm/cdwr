/** Anything but unset, '', 'false' or '0' (case-insensitive) */
export const isSet = (value: string | undefined): boolean =>
  !['', 'false', '0'].includes((value ?? '').toLowerCase());

export type SecretsMode = 'ci' | 'offline' | 'online';

/**
 * CI already has its environment from GitHub secrets and no session to use,
 * so it is checked first. OFFLINE is the developer's deliberate opt-out.
 * Neither is ever an automatic fallback: a developer machine whose session
 * is gone must fail loudly, not hide behind stale local values.
 */
export const secretsMode = (env: NodeJS.ProcessEnv): SecretsMode => {
  if (isSet(env['CI'])) return 'ci';
  if (isSet(env['OFFLINE'])) return 'offline';
  return 'online';
};

/** The Infisical environment to read */
export const deployEnvironment = (env: NodeJS.ProcessEnv): string =>
  env['DEPLOY_ENV'] || 'development';
