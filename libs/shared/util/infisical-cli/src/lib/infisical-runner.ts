import { execFileSync } from 'node:child_process';

/** Runs the infisical CLI with the given arguments and returns stdout */
export type InfisicalRunner = (args: string[]) => string;

export class InfisicalMissingError extends Error {
  constructor() {
    super(
      [
        'The Infisical CLI is not installed.',
        '  Install it, then `infisical login`.',
        '  Working offline on purpose? Re-run with OFFLINE=1.'
      ].join('\n')
    );
    this.name = 'InfisicalMissingError';
  }
}

const isNotFound = (error: unknown): boolean =>
  error instanceof Error && 'code' in error && error.code === 'ENOENT';

/** Uses the session you logged in with, so no token is ever involved */
export const runInfisical: InfisicalRunner = (args) => {
  try {
    return execFileSync('infisical', args, {
      encoding: 'utf8',
      // Only stdout is parsed; without this Infisical's error never reaches the terminal
      stdio: ['ignore', 'pipe', 'inherit']
    });
  } catch (error) {
    if (isNotFound(error)) throw new InfisicalMissingError();
    throw error;
  }
};

/**
 * Parses CLI output as JSON. A failure names where it came from and nothing
 * of the output, which may hold secrets.
 */
export const parseJsonOutput = (output: string, what: string): unknown => {
  try {
    return JSON.parse(output.trim() || 'null');
  } catch {
    throw new Error(`infisical returned output that is not JSON (${what})`);
  }
};
