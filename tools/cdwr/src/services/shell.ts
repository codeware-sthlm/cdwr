import {
  type ChildProcess,
  type SpawnOptions,
  execFile,
  spawn
} from 'node:child_process';
import { isMainThread, parentPort } from 'node:worker_threads';

/** Children still running; killed when this process leaves, however it leaves */
const children = new Set<ChildProcess>();

export function track<T extends ChildProcess>(child: T): T {
  children.add(child);
  child.once('exit', () => children.delete(child));
  // The app kills what a worker spawned when it aborts the worker
  if (!isMainThread && child.pid) {
    parentPort?.postMessage({ type: 'child', pid: child.pid });
  }
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
  /** Written to the child's stdin, which is then closed */
  input?: string;
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
    // A child that exits without reading its stdin makes the write fail with EPIPE
    let stdinError: NodeJS.ErrnoException | undefined;
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
        const failure = error ?? stdinError;
        if (failure) {
          const code =
            'code' in failure && failure.code !== undefined
              ? (failure.code as number | string)
              : null;
          reject(
            new CommandError(
              [binary, ...args].join(' '),
              stdout,
              stderr,
              error?.killed ? 'killed' : code
            )
          );
          return;
        }
        resolve({ stdout, stderr });
      }
    );
    if (options.input !== undefined) {
      child.stdin?.on('error', (error: NodeJS.ErrnoException) => {
        stdinError ??= error;
      });
      child.stdin?.end(options.input);
    }
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
    const emit = (line: string) => {
      if (!line.trim()) return;
      onLine(line);
      tail.push(line);
      if (tail.length > 20) tail.shift();
    };
    // A pipe chunk can split mid-line; each stream keeps its own leftover
    // fragment and only complete lines are emitted, stdout and stderr apart
    // so their lines are never spliced into each other's fragments.
    const reader = () => {
      let carry = '';
      return (chunk: Buffer) => {
        const lines = (carry + chunk.toString()).split(/\r?\n/);
        carry = lines.pop() ?? '';
        for (const line of lines) emit(line);
      };
    };
    const readStdout = reader();
    const readStderr = reader();
    child.stdout?.on('data', readStdout);
    child.stderr?.on('data', readStderr);
    child.on('error', reject);
    child.on('exit', (code, signal) => {
      // Flush whatever fragment never saw a trailing newline
      readStdout(Buffer.from('\n'));
      readStderr(Buffer.from('\n'));
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

/**
 * Run a binary on the terminal, stdio inherited, and resolve its exit code
 * (null when a signal ended it). Rejects with the spawn error, such as ENOENT.
 * Ctrl-C and Ctrl-\ reach the child alone while it runs, as with system(3):
 * left to their default here they would end this process under it.
 */
export function runInteractive(
  binary: string,
  args: string[],
  options: Pick<SpawnOptions, 'cwd' | 'env'> = {}
): Promise<number | null> {
  const ignore = (): void => undefined;
  process.on('SIGINT', ignore);
  process.on('SIGQUIT', ignore);
  const restore = (): void => {
    process.off('SIGINT', ignore);
    process.off('SIGQUIT', ignore);
  };
  // A prompt before may have left stdin raw or flowing; the child reads it alone
  if (process.stdin.isTTY) process.stdin.setRawMode(false);
  process.stdin.pause();
  return new Promise<number | null>((resolve, reject) => {
    const child = track(spawn(binary, args, { ...options, stdio: 'inherit' }));
    child.once('error', reject);
    child.once('exit', (code) => resolve(code));
  }).finally(restore);
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
