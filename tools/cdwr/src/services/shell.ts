import {
  type ChildProcess,
  type SpawnOptions,
  execFile,
  spawn
} from 'node:child_process';

/** Children still running; killed when this process leaves, however it leaves */
const children = new Set<ChildProcess>();

export function track<T extends ChildProcess>(child: T): T {
  children.add(child);
  child.once('exit', () => children.delete(child));
  return child;
}

process.once('exit', () => {
  for (const child of children) child.kill();
});

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
    const child = execFile(
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
    track(child);
  });
}

/**
 * Run a binary and hand every output line to the caller as it arrives, for
 * long builds whose progress is worth showing. The UI owns the screen, so
 * nothing inherits stdio.
 */
export function runStreaming(
  binary: string,
  args: string[],
  onLine: (line: string) => void,
  options: Pick<SpawnOptions, 'cwd' | 'env'> = {}
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = track(
      spawn(binary, args, { ...options, stdio: ['ignore', 'pipe', 'pipe'] })
    );
    const tail: string[] = [];
    const feed = (chunk: Buffer) => {
      for (const line of chunk.toString().split(/\r?\n/)) {
        if (!line.trim()) continue;
        onLine(line);
        tail.push(line);
        if (tail.length > 20) tail.shift();
      }
    };
    child.stdout?.on('data', feed);
    child.stderr?.on('data', feed);
    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (code === 0) resolve();
      else
        reject(
          new CommandError(
            [binary, ...args].join(' '),
            '',
            tail.join('\n'),
            code ?? signal
          )
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
