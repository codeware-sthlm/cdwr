import {
  InfisicalMissingError,
  type InfisicalRunner,
  listFolders,
  runInfisical
} from '@codeware/shared/util/infisical-cli';

export type SessionState =
  | { state: 'ok' }
  | { state: 'not-installed'; hint: string }
  | { state: 'not-logged-in'; hint: string };

/** One cheap read: listing the root folders needs a session and returns no value */
export const probeSession = (
  environment: string,
  run: InfisicalRunner = runInfisical
): SessionState => {
  try {
    listFolders('/', environment, run);
    return { state: 'ok' };
  } catch (error) {
    if (error instanceof InfisicalMissingError) {
      return {
        state: 'not-installed',
        hint: 'Install the Infisical CLI, then `infisical login`'
      };
    }
    // The message never holds CLI output, so it is safe to show
    return {
      state: 'not-logged-in',
      hint: `Infisical CLI failed: ${error instanceof Error ? error.message : String(error)} — not logged in? \`infisical login\``
    };
  }
};
