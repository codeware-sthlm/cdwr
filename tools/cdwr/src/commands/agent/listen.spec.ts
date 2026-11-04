import { resolve } from 'node:path';

import type { Context } from '../../cli/context';
import { CliError } from '../../cli/errors';

import type { QueuePaths } from './agent.logic';

vi.mock('../../cli/preflight', () => ({ preflight: vi.fn() }));

const requireHost = vi.fn();
vi.mock('../../services/agent-queue', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../services/agent-queue')>();
  return {
    ...actual,
    requireHost: (...args: unknown[]) => requireHost(...args),
    paths: () => ({ home: '/queue/home' }) as QueuePaths
  };
});

const env = {
  AGENT_SUPABASE_URL: 'https://example.supabase.co',
  AGENT_SUPABASE_ANON_KEY: 'anon'
};

async function plan(envVars: Record<string, string>, stateFile = '') {
  const command = (await import('./listen')).default;
  return command.plan({ env: envVars } as unknown as Context, {
    notifyPid: 42,
    stateFile
  });
}

describe('agent listen plan', () => {
  beforeEach(() => requireHost.mockReset());

  it('defaults the state file to listener.json in the queue home', async () => {
    const result = await plan(env);
    expect(result.data.stateFile).toBe('/queue/home/listener.json');
  });

  it('uses the given state file, resolved', async () => {
    const result = await plan(env, '/some/where/state.json');
    expect(result.data.stateFile).toBe('/some/where/state.json');
    const relative = await plan(env, 'state.json');
    expect(relative.data.stateFile).toBe(resolve('state.json'));
  });

  it('fails without the publishable key', async () => {
    await expect(
      plan({ AGENT_SUPABASE_URL: env.AGENT_SUPABASE_URL })
    ).rejects.toThrow(new CliError('AGENT_SUPABASE_ANON_KEY is not set'));
  });

  it('runs in the container and under launchd', async () => {
    await plan(env);
    expect(requireHost).toHaveBeenCalledWith(
      ['container', 'launchd'],
      expect.anything()
    );
  });
});
