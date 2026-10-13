/**
 * Whether a command may prompt.
 *
 * A command path alone (global flags such as `--dry-run` aside) asks for what
 * it needs; once a command input is given, it runs with what it was given
 * unless `--interactive` asks for prompts again.
 * `--json` never prompts. `main` and `runCommand` both decide through this, so
 * they cannot disagree.
 */
export const wantsPrompts = (options: {
  /** stdin and stdout are a terminal */
  tty: boolean;
  /** a command input was given, as a flag or positional */
  hasArgs: boolean;
  interactive: boolean;
  json: boolean;
}): boolean =>
  options.tty && !options.json && (!options.hasArgs || options.interactive);

/** Only a bare `cdwr` on a terminal opens the full-screen app */
export const opensApp = (argv: ReadonlyArray<string>, tty: boolean): boolean =>
  tty && argv.length === 0;
