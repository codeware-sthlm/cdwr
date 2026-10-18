export type InfisicalRunExecutorSchema = {
  /** Infisical folder, e.g. /apps/cms */
  path: string;
  /** Commands to run in order through a shell */
  commands: string[];
  /** Working directory relative to the workspace root, defaults to the project root */
  cwd?: string;
  /** Extra attempts for a command that ends as a cms exit-guard no-op; 0 is off */
  retryGuardedNoOp?: number;
  /** Values the target sets on purpose */
  env?: Record<string, string>;
};
