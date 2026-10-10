export type InfisicalRunExecutorSchema = {
  /** Infisical folder, e.g. /apps/cms */
  path: string;
  /** Commands to run in order through a shell */
  commands: string[];
  /** Working directory relative to the workspace root, defaults to the project root */
  cwd?: string;
  /** Values the target sets on purpose */
  env?: Record<string, string>;
};
