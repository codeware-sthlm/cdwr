// @vitest-environment node
import type { ExecutorContext } from '@nx/devkit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const runCommands = vi.hoisted(() => vi.fn());
vi.mock('nx/src/executors/run-commands/run-commands.impl', () => ({
  runCommands
}));

import infisicalRun from './executor';

const GUARD = { code: 1, terminalOutput: 'script ended without completing' };
const FAIL = { code: 1, terminalOutput: 'Error: tenant not found' };
const OK = { code: 0, terminalOutput: '' };

const queue = (...results: { code: number; terminalOutput: string }[]) => {
  for (const result of results) {
    runCommands.mockResolvedValueOnce({
      getResults: () => Promise.resolve(result)
    });
  }
};

const context = {
  root: '/tmp',
  cwd: '/tmp',
  isVerbose: false,
  projectName: 'cms',
  targetName: 'seed',
  projectsConfigurations: {
    version: 2,
    projects: { cms: { root: 'apps/cms' } }
  },
  nxJsonConfiguration: {},
  projectGraph: { nodes: {}, dependencies: {} }
} as ExecutorContext;

const run = (retryGuardedNoOp?: number, commands = ['a']) =>
  infisicalRun({ path: '/apps/cms', commands, retryGuardedNoOp }, context);

const logged = () =>
  vi
    .mocked(console.log)
    .mock.calls.map((call) => call.join(' '))
    .join('\n');

let savedCi: string | undefined;

beforeEach(() => {
  savedCi = process.env['CI'];
  process.env['CI'] = 'true';
  runCommands.mockReset();
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  if (savedCi === undefined) delete process.env['CI'];
  else process.env['CI'] = savedCi;
  vi.restoreAllMocks();
});

describe('infisicalRun retryGuardedNoOp', () => {
  it('retries guard failures until the command succeeds', async () => {
    queue(GUARD, GUARD, OK);

    expect(await run(5)).toEqual({ success: true });
    expect(runCommands).toHaveBeenCalledTimes(3);
    expect(logged()).toContain('retry 1/5');
    expect(logged()).toContain('retry 2/5');
  });

  it('fails after N+1 runs when the guard keeps firing', async () => {
    queue(GUARD, GUARD, GUARD);

    expect(await run(2)).toEqual({ success: false });
    expect(runCommands).toHaveBeenCalledTimes(3);
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('kept ending as a guarded no-op')
    );
  });

  it('does not retry a real failure', async () => {
    queue(FAIL);

    expect(await run(5)).toEqual({ success: false });
    expect(runCommands).toHaveBeenCalledTimes(1);
  });

  it('runs all commands in one call when the option is off', async () => {
    queue(OK);

    expect(await run(0, ['a', 'b'])).toEqual({ success: true });
    expect(runCommands).toHaveBeenCalledTimes(1);
    expect(runCommands.mock.calls[0][0].commands).toEqual(['a', 'b']);
  });

  it('never re-runs an earlier command', async () => {
    queue(GUARD, OK, OK);

    expect(await run(3, ['a', 'b'])).toEqual({ success: true });
    const ran = runCommands.mock.calls.map((call) => call[0].commands[0]);
    expect(ran).toEqual(['a', 'a', 'b']);
  });
});
