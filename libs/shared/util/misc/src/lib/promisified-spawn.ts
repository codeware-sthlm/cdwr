import {
  SpawnOptions as SpawnOptionsChildProcess,
  spawn as cpSpawn
} from 'child_process';

export type SpawnOptions = Exclude<SpawnOptionsChildProcess, 'stdio'> & {
  /**
   * Stream output to console in real-time while still capturing it.
   * When true, both stdout and stderr will be piped to the console in real-time,
   * and the output will still be captured and returned for parsing.
   */
  streamToConsole?: boolean;
};

/** Lines of stderr kept in the rejection message when output is streamed. */
export const STREAMED_STDERR_TAIL_LINES = 20;

/**
 * Rejection of `spawn` on a non-zero exit code.
 * The full output is kept on the error, the message may only carry a tail of it.
 */
export class SpawnError extends Error {
  readonly exitCode: number | null;
  readonly stdout: string;
  readonly stderr: string;

  constructor(
    message: string,
    details: { exitCode: number | null; stdout: string; stderr: string }
  ) {
    super(message);
    this.name = 'SpawnError';
    this.exitCode = details.exitCode;
    this.stdout = details.stdout;
    this.stderr = details.stderr;
  }
}

/**
 * Promisified version of the `spawn` function from the `child_process` module.
 *
 * **Note!**
 *
 * The process is considered successful if it resolves, no matter the output of `stdout` or `stderr`.
 *
 * In case of a non-zero exit code, the promise will be rejected as `SpawnError` with message containing the exit code and stderr output.
 * When `streamToConsole` is on the stderr is already printed, so the message carries only its last lines.
 *
 * @param command - The command to spawn.
 * @param args - The arguments to pass to the command.
 * @param options - The options to pass to the child process.
 * @returns A promise that resolves with the stdout and stderr of the child process.
 */
export function spawn(
  command: string,
  args: readonly string[],
  options?: SpawnOptions
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    // Extract streamToConsole from options
    const { streamToConsole, ...spawnOptions } = options || {};

    // Spawn the process with stdio set to 'pipe'
    const process = cpSpawn(command, args, {
      ...spawnOptions,
      stdio: 'pipe'
    });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    process.stdout.on('data', (data) => {
      stdoutChunks.push(Buffer.from(data));
      // If streamToConsole is true, pipe to parent process stdout
      if (streamToConsole) {
        global.process.stdout.write(data);
      }
    });

    process.stderr.on('data', (data) => {
      stderrChunks.push(Buffer.from(data));
      // If streamToConsole is true, pipe to parent process stderr
      if (streamToConsole) {
        global.process.stderr.write(data);
      }
    });

    process.on('close', (code) => {
      const stdout = Buffer.concat(stdoutChunks).toString();
      const stderr = Buffer.concat(stderrChunks).toString();

      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        // Reject with error to be consistent with 'error' event
        const lines = stderr.replace(/\r?\n$/, '').split(/\r?\n/);
        const message =
          streamToConsole && lines.length > STREAMED_STDERR_TAIL_LINES
            ? `Process exited with code ${code}\nError (last ${STREAMED_STDERR_TAIL_LINES} lines; the full output is above):\n${lines
                .slice(-STREAMED_STDERR_TAIL_LINES)
                .join('\n')}`
            : `Process exited with code ${code}\nError: ${stderr}`;
        reject(new SpawnError(message, { exitCode: code, stdout, stderr }));
      }
    });

    // Reject with the error
    process.on('error', reject);
  });
}
