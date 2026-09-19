/** Exit codes the CLI uses, shared with the shell completion and docs */
export const EXIT = {
  ok: 0,
  failed: 1,
  usage: 2,
  cancelled: 130
} as const;

/** An error the CLI reports as a message and an exit code, without a stack */
export class CliError extends Error {
  constructor(
    message: string,
    readonly exitCode: number = EXIT.failed,
    readonly hint?: string
  ) {
    super(message);
    this.name = 'CliError';
  }
}

/** Wrong flags or a missing input in non-interactive mode */
export class UsageError extends CliError {
  constructor(message: string, hint?: string) {
    super(message, EXIT.usage, hint);
    this.name = 'UsageError';
  }
}

/** The user pressed ctrl-c or declined a confirmation */
export class Cancelled extends CliError {
  constructor(message = 'Cancelled') {
    super(message, EXIT.cancelled);
    this.name = 'Cancelled';
  }
}

/** The message of anything thrown */
export const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);
