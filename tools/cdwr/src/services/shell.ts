import { type SpawnOptions, execFile, spawn } from 'node:child_process';

export interface Output {
  stdout: string;
  stderr: string;
}

export interface RunOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  /** Milliseconds before the process is killed */
  timeout?: number;
  /** Bytes of output to keep; commands that dump SQL need more than the default */
  maxBuffer?: number;
}

/** An exec failure that keeps both streams, so the caller can show them */
export class CommandError extends Error {
  constructor(
    readonly command: string,
    readonly stdout: string,
    readonly stderr: string,
    readonly code: number | string | null
  ) {
    super(
      `${command} failed${code === null ? '' : ` (${code})`}${
        stderr.trim() ? `: ${stderr.trim()}` : ''
      }`
    );
    this.name = 'CommandError';
  }
}

/** Run a binary with arguments, no shell, and collect its output */
export function run(
  binary: string,
  args: string[],
  options: RunOptions = {}
): Promise<Output> {
  return new Promise((resolve, reject) => {
    execFile(
      binary,
      args,
      {
        cwd: options.cwd,
        env: options.env,
        timeout: options.timeout,
        maxBuffer: options.maxBuffer ?? 64 * 1024 * 1024,
        encoding: 'utf8'
      },
      (error, stdout, stderr) => {
        if (error) {
          const code =
            'code' in error && error.code !== undefined
              ? (error.code as number | string)
              : null;
          reject(
            new CommandError(
              [binary, ...args].join(' '),
              stdout,
              stderr,
              error.killed ? 'killed' : code
            )
          );
          return;
        }
        resolve({ stdout, stderr });
      }
    );
  });
}

/** Run a binary with the terminal attached, for anything interactive or long */
export function runAttached(
  binary: string,
  args: string[],
  options: Pick<SpawnOptions, 'cwd' | 'env'> = {}
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { ...options, stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (code === 0) resolve();
      else
        reject(
          new CommandError([binary, ...args].join(' '), '', '', code ?? signal)
        );
    });
  });
}

/** Quote for a POSIX shell, for the rare command that has to go through one */
export const shellQuote = (value: string): string =>
  `'${value.replace(/'/g, "'\\''")}'`;

export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Env for a child `tsx` process. This CLI runs under tsx, which leaves its own
 * instrumentation in the env: a relative tsconfig path the child would resolve
 * against its own cwd, and a NODE_PATH into tsx's bundle. Drop it.
 */
export function childEnv(
  env: NodeJS.ProcessEnv,
  extra: Record<string, string> = {}
): NodeJS.ProcessEnv {
  const parent = { ...env };
  for (const key of ['TSX_TSCONFIG_PATH', 'NODE_PATH', 'NODE_OPTIONS']) {
    delete parent[key];
  }
  return { ...parent, ...extra };
}
