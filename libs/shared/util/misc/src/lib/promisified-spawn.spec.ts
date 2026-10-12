import { spawn as cpSpawn } from 'child_process';
import { EventEmitter } from 'events';

import { MockInstance, beforeEach, describe, expect, it, vi } from 'vitest';

import { SpawnError, type SpawnOptions, spawn } from './promisified-spawn';

// Create types for our mocked process
type MockProcess = EventEmitter & {
  stdout: EventEmitter;
  stderr: EventEmitter;
};

// Mock child_process
vi.mock('child_process', () => ({
  spawn: vi.fn().mockImplementation(() => {
    const mockProcess = new EventEmitter();

    // Create mock streams for stdout and stderr
    const mockStdout = new EventEmitter();
    const mockStderr = new EventEmitter();

    // Assign the mock streams to the mock process
    Object.assign(mockProcess, {
      stdout: mockStdout,
      stderr: mockStderr
    });

    return mockProcess;
  })
}));

describe('spawn', () => {
  let mockProcess: MockProcess;
  const mockSpawn = vi.mocked(cpSpawn);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const invokeSpawn = (
    command: string,
    args: string[],
    options?: SpawnOptions
  ) => {
    const spawnPromise = spawn(command, args, options);

    // Get the mock process instance after each spawn call
    mockProcess = mockSpawn.mock.results[0]?.value;

    return spawnPromise;
  };

  it('should spawn a process and resolve with output on successful completion', async () => {
    const spawnPromise = invokeSpawn('test-command', ['arg1', 'arg2']);

    // Emit test data
    mockProcess.stdout.emit('data', Buffer.from('stdout data'));
    mockProcess.stderr.emit('data', Buffer.from('stderr data'));
    mockProcess.emit('close', 0);

    const result = await spawnPromise;

    expect(result).toEqual({
      stdout: 'stdout data',
      stderr: 'stderr data'
    });

    expect(cpSpawn).toHaveBeenCalledWith('test-command', ['arg1', 'arg2'], {
      stdio: 'pipe'
    });
  });

  it('should reject with error when process exits with non-zero code', async () => {
    const spawnPromise = invokeSpawn('test-command', ['arg1']);

    mockProcess.stderr.emit('data', Buffer.from('error message'));
    mockProcess.emit('close', 1);

    await expect(spawnPromise).rejects.toThrow(
      'Process exited with code 1\nError: error message'
    );
  });

  it('should reject when process emits an error', async () => {
    const spawnPromise = invokeSpawn('test-command', ['arg1']);

    const testError = new Error('spawn error');
    mockProcess.emit('error', testError);

    await expect(spawnPromise).rejects.toThrow(testError);
  });

  it('should handle multiple stdout/stderr chunks', async () => {
    const spawnPromise = invokeSpawn('test-command', ['arg1']);

    mockProcess.stdout.emit('data', Buffer.from('chunk1 '));
    mockProcess.stdout.emit('data', Buffer.from('chunk2'));
    mockProcess.stderr.emit('data', Buffer.from('error1 '));
    mockProcess.stderr.emit('data', Buffer.from('error2'));
    mockProcess.emit('close', 0);

    const result = await spawnPromise;

    expect(result).toEqual({
      stdout: 'chunk1 chunk2',
      stderr: 'error1 error2'
    });
  });

  it('should pass through additional spawn options', async () => {
    const spawnPromise = invokeSpawn('test-command', ['arg1'], {
      cwd: '/test/dir',
      env: { TEST_ENV: 'value', NODE_ENV: 'test' }
    });

    mockProcess.emit('close', 0);

    await spawnPromise;

    expect(cpSpawn).toHaveBeenCalledWith('test-command', ['arg1'], {
      cwd: '/test/dir',
      env: { TEST_ENV: 'value', NODE_ENV: 'test' },
      stdio: 'pipe'
    });
  });

  describe('streamToConsole option', () => {
    let stdoutWriteSpy: MockInstance;
    let stderrWriteSpy: MockInstance;

    beforeEach(() => {
      // Spy on write methods of global process streams
      stdoutWriteSpy = vi
        .spyOn(global.process.stdout, 'write')
        .mockImplementation(() => true);
      stderrWriteSpy = vi
        .spyOn(global.process.stderr, 'write')
        .mockImplementation(() => true);
    });

    afterEach(() => {
      // Restore original write methods
      stdoutWriteSpy.mockRestore();
      stderrWriteSpy.mockRestore();
    });

    it('should write stdout to console when streamToConsole is true', async () => {
      const spawnPromise = invokeSpawn('test-command', ['arg1'], {
        streamToConsole: true
      });

      const stdoutData = Buffer.from('test stdout');
      mockProcess.stdout.emit('data', stdoutData);
      mockProcess.emit('close', 0);

      await spawnPromise;

      expect(stdoutWriteSpy).toHaveBeenCalledWith(stdoutData);
      expect(stderrWriteSpy).not.toHaveBeenCalled();
    });

    it('should write stderr to console when streamToConsole is true', async () => {
      const spawnPromise = invokeSpawn('test-command', ['arg1'], {
        streamToConsole: true
      });

      const stderrData = Buffer.from('test stderr');
      mockProcess.stderr.emit('data', stderrData);
      mockProcess.emit('close', 0);

      await spawnPromise;

      expect(stderrWriteSpy).toHaveBeenCalledWith(stderrData);
      expect(stdoutWriteSpy).not.toHaveBeenCalled();
    });

    it('should write both stdout and stderr to console when streamToConsole is true', async () => {
      const spawnPromise = invokeSpawn('test-command', ['arg1'], {
        streamToConsole: true
      });

      const stdoutData = Buffer.from('test stdout');
      const stderrData = Buffer.from('test stderr');
      mockProcess.stdout.emit('data', stdoutData);
      mockProcess.stderr.emit('data', stderrData);
      mockProcess.emit('close', 0);

      await spawnPromise;

      expect(stdoutWriteSpy).toHaveBeenCalledWith(stdoutData);
      expect(stderrWriteSpy).toHaveBeenCalledWith(stderrData);
    });

    it('should not write to console when streamToConsole is false', async () => {
      const spawnPromise = invokeSpawn('test-command', ['arg1'], {
        streamToConsole: false
      });

      mockProcess.stdout.emit('data', Buffer.from('test stdout'));
      mockProcess.stderr.emit('data', Buffer.from('test stderr'));
      mockProcess.emit('close', 0);

      await spawnPromise;

      expect(stdoutWriteSpy).not.toHaveBeenCalled();
      expect(stderrWriteSpy).not.toHaveBeenCalled();
    });

    it('should not write to console when streamToConsole is not specified', async () => {
      const spawnPromise = invokeSpawn('test-command', ['arg1']);

      mockProcess.stdout.emit('data', Buffer.from('test stdout'));
      mockProcess.stderr.emit('data', Buffer.from('test stderr'));
      mockProcess.emit('close', 0);

      await spawnPromise;

      expect(stdoutWriteSpy).not.toHaveBeenCalled();
      expect(stderrWriteSpy).not.toHaveBeenCalled();
    });

    it('should still capture output when streamToConsole is true', async () => {
      const spawnPromise = invokeSpawn('test-command', ['arg1'], {
        streamToConsole: true
      });

      mockProcess.stdout.emit('data', Buffer.from('stdout data'));
      mockProcess.stderr.emit('data', Buffer.from('stderr data'));
      mockProcess.emit('close', 0);

      const result = await spawnPromise;

      // Verify output is still captured
      expect(result).toEqual({
        stdout: 'stdout data',
        stderr: 'stderr data'
      });

      // Verify logs were written
      expect(stdoutWriteSpy).toHaveBeenCalled();
      expect(stderrWriteSpy).toHaveBeenCalled();
    });

    it('should not pass streamToConsole to child_process spawn', async () => {
      const spawnPromise = invokeSpawn('test-command', ['arg1'], {
        streamToConsole: true,
        cwd: '/test/dir'
      });

      mockProcess.emit('close', 0);

      await spawnPromise;

      // streamToConsole should be filtered out, only cwd should be passed
      expect(cpSpawn).toHaveBeenCalledWith('test-command', ['arg1'], {
        cwd: '/test/dir',
        stdio: 'pipe'
      });
    });
  });

  describe('SpawnError', () => {
    const lines = (n: number) =>
      Array.from({ length: n }, (_, i) => `line ${i + 1}`).join('\n');

    let stdoutWriteSpy: MockInstance;
    let stderrWriteSpy: MockInstance;

    beforeEach(() => {
      stdoutWriteSpy = vi
        .spyOn(global.process.stdout, 'write')
        .mockImplementation(() => true);
      stderrWriteSpy = vi
        .spyOn(global.process.stderr, 'write')
        .mockImplementation(() => true);
    });

    afterEach(() => {
      stdoutWriteSpy.mockRestore();
      stderrWriteSpy.mockRestore();
    });

    const fail = async (stderr: string, options?: SpawnOptions) => {
      const spawnPromise = invokeSpawn('test-command', [], options);
      mockProcess.stdout.emit('data', Buffer.from('out'));
      mockProcess.stderr.emit('data', Buffer.from(stderr));
      mockProcess.emit('close', 3);
      return (await spawnPromise.catch((e) => e)) as SpawnError;
    };

    it('should keep the full message when not streaming', async () => {
      const stderr = `${lines(30)}\n`;
      const error = await fail(stderr);

      expect(error).toBeInstanceOf(SpawnError);
      expect(error.name).toBe('SpawnError');
      expect(error.message).toBe(
        `Process exited with code 3\nError: ${stderr}`
      );
      expect(error.exitCode).toBe(3);
      expect(error.stdout).toBe('out');
      expect(error.stderr).toBe(stderr);
    });

    it('should keep only the last lines in the message when streaming', async () => {
      const stderr = `${lines(30)}\n`;
      const error = await fail(stderr, { streamToConsole: true });

      expect(error).toBeInstanceOf(SpawnError);
      expect(error.message).toBe(
        `Process exited with code 3\nError (last 20 lines; the full output is above):\n${lines(
          30
        )
          .split('\n')
          .slice(-20)
          .join('\n')}`
      );
      expect(error.message).not.toContain('line 10\n');
      expect(error.message).toContain('line 30');
      expect(error.stderr).toBe(stderr);
      expect(stderrWriteSpy).toHaveBeenCalled();
    });

    it('should keep the full message without marker for short stderr when streaming', async () => {
      const stderr = `${lines(5)}\n`;
      const error = await fail(stderr, { streamToConsole: true });

      expect(error.message).toBe(
        `Process exited with code 3\nError: ${stderr}`
      );
      expect(error.message).not.toContain('last 20 lines');
    });
  });
});
