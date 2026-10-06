import * as core from '@actions/core';
import type { Fly } from '@cdwr/fly-node';
import { getPullRequest } from '@codeware/shared/util/github';

import {
  databaseMatcher,
  psqlCommand,
  reportVolumeUsage,
  runDestroyDatabases
} from './run-destroy-databases';

vi.mock('@codeware/shared/util/github', () => ({
  getPullRequest: vi.fn()
}));

vi.mock('@actions/core', () => {
  const summary = {
    addHeading: vi.fn(),
    addRaw: vi.fn(),
    write: vi.fn()
  };
  summary.addHeading.mockReturnValue(summary);
  summary.addRaw.mockReturnValue(summary);
  summary.write.mockResolvedValue(summary);
  return { info: vi.fn(), warning: vi.fn(), summary };
});

const getPullRequestMock = vi.mocked(getPullRequest);

const TEMPLATE = 'cdwr_cms_${PR_NUMBER}';

/** PR states by number; absent means not found */
const prStates: Record<number, 'open' | 'closed'> = {};

type FakeCluster = {
  databases: string;
  roles: string;
  /** SQL fragments whose execution should fail */
  failOn?: string[];
};

const setup = (cluster: FakeCluster) => {
  const exec = vi.fn(async (_app: string, command: string) => {
    if (cluster.failOn?.some((fragment) => command.includes(fragment))) {
      throw new Error('boom');
    }
    if (command.includes('FROM pg_database')) {
      return cluster.databases;
    }
    if (command.includes('FROM pg_roles')) {
      return cluster.roles;
    }
    return '';
  });
  const fly = { ssh: { exec } } as unknown as Fly;
  const drops = () =>
    exec.mock.calls
      .map(([, command]) => command)
      .filter((command) => command.includes('DROP '));
  return { fly, exec, drops };
};

describe('databaseMatcher', () => {
  it('matches the PR number in the template', () => {
    const matcher = databaseMatcher(TEMPLATE);
    expect('cdwr_cms_12'.match(matcher)?.[1]).toBe('12');
  });

  it.each(['cdwr_cms_12_x', 'xcdwr_cms_12', 'cdwr_cms_'])(
    'does not match %s',
    (name) => {
      expect(databaseMatcher(TEMPLATE).test(name)).toBe(false);
    }
  );

  it('escapes regex characters in the template', () => {
    const matcher = databaseMatcher('db.v1_${PR_NUMBER}');
    expect(matcher.test('db.v1_5')).toBe(true);
    expect(matcher.test('dbXv1_5')).toBe(false);
  });

  it('throws without the placeholder', () => {
    expect(() => databaseMatcher('cdwr_cms')).toThrow('exactly once');
  });

  it('throws on a double placeholder', () => {
    expect(() => databaseMatcher('a_${PR_NUMBER}_${PR_NUMBER}')).toThrow(
      'exactly once'
    );
  });
});

describe('psqlCommand', () => {
  it('quotes the SQL for the remote shell', () => {
    const command = psqlCommand("SELECT 'a';");
    expect(command.startsWith('sh -c ')).toBe(true);
    expect(command).toContain('OPERATOR_PASSWORD');
    expect(command).toContain('SELECT');
  });
});

describe('runDestroyDatabases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const key of Object.keys(prStates)) {
      delete prStates[Number(key)];
    }
    getPullRequestMock.mockImplementation(async (_token, number) => {
      const state = prStates[number];
      return state ? ({ state } as never) : null;
    });
  });

  const options = { cluster: 'pg', template: TEMPLATE, dryRun: false };

  it('drops only databases of closed PRs, keeps open and not-found', async () => {
    prStates[1] = 'closed';
    prStates[2] = 'open';
    // 3 is not found
    const { fly, drops } = setup({
      databases: 'postgres\ncdwr_cms_1\ncdwr_cms_2\ncdwr_cms_3\nother_db\n',
      roles: ''
    });

    const result = await runDestroyDatabases('t', fly, options);

    expect(result).toEqual({ dropped: ['cdwr_cms_1'], skipped: [] });
    expect(drops()).toHaveLength(1);
    expect(drops()[0]).toContain('cdwr_cms_1');
    expect(core.warning).toHaveBeenCalledWith(
      expect.stringContaining('#3 not found')
    );
  });

  it('executes no drop in a dry run', async () => {
    prStates[1] = 'closed';
    const { fly, drops } = setup({
      databases: 'cdwr_cms_1',
      roles: 'cdwr_cms_pr_1_moon'
    });

    const result = await runDestroyDatabases('t', fly, {
      ...options,
      dryRun: true
    });

    expect(result).toEqual({ dropped: [], skipped: [] });
    expect(drops()).toHaveLength(0);
    expect(core.info).toHaveBeenCalledWith(
      expect.stringContaining('Would drop database (dry run)')
    );
  });

  it('moves a failing drop to skipped without throwing', async () => {
    prStates[1] = 'closed';
    prStates[2] = 'closed';
    const { fly } = setup({
      databases: 'cdwr_cms_1\ncdwr_cms_2',
      roles: '',
      failOn: ['DROP DATABASE IF EXISTS "cdwr_cms_1"']
    });

    const result = await runDestroyDatabases('t', fly, options);

    expect(result).toEqual({
      dropped: ['cdwr_cms_2'],
      skipped: ['cdwr_cms_1']
    });
    expect(core.warning).toHaveBeenCalledWith(
      expect.stringContaining('Failed to drop database')
    );
  });

  describe('roles', () => {
    it('drops preview roles of closed PRs and never system roles', async () => {
      prStates[575] = 'closed';
      prStates[362] = 'closed';
      const { fly, drops } = setup({
        databases: '',
        roles:
          'postgres\nrepmgr\nflypgadmin\ncdwr_cms_pr_575_moon\ncdwr_cms_pr_362\n'
      });

      await runDestroyDatabases('t', fly, options);

      const dropped = drops();
      expect(dropped).toHaveLength(2);
      expect(dropped.some((c) => c.includes('cdwr_cms_pr_575_moon'))).toBe(
        true
      );
      expect(dropped.some((c) => c.includes('cdwr_cms_pr_362'))).toBe(true);
      for (const name of ['postgres', 'repmgr', 'flypgadmin']) {
        expect(dropped.some((c) => c.includes(`"${name}"`))).toBe(false);
      }
    });

    it('keeps roles of open PRs', async () => {
      prStates[575] = 'open';
      const { fly, drops } = setup({
        databases: '',
        roles: 'cdwr_cms_pr_575_moon'
      });

      await runDestroyDatabases('t', fly, options);

      expect(drops()).toHaveLength(0);
    });

    it('only warns when a role drop fails', async () => {
      prStates[575] = 'closed';
      const { fly } = setup({
        databases: '',
        roles: 'cdwr_cms_pr_575_moon',
        failOn: ['DROP ROLE']
      });

      await expect(runDestroyDatabases('t', fly, options)).resolves.toEqual({
        dropped: [],
        skipped: []
      });
      expect(core.warning).toHaveBeenCalledWith(
        expect.stringContaining('Failed to drop role')
      );
    });
  });

  it('keeps the dropped databases when the role listing fails', async () => {
    prStates[1] = 'closed';
    const { fly } = setup({
      databases: 'cdwr_cms_1',
      roles: '',
      failOn: ['FROM pg_roles']
    });

    await expect(runDestroyDatabases('t', fly, options)).resolves.toEqual({
      dropped: ['cdwr_cms_1'],
      skipped: []
    });
    expect(core.warning).toHaveBeenCalledWith(
      expect.stringContaining('Could not list roles')
    );
  });

  it('only warns when the database listing fails', async () => {
    const { fly, drops } = setup({
      databases: '',
      roles: '',
      failOn: ['FROM pg_database']
    });

    await expect(runDestroyDatabases('t', fly, options)).resolves.toEqual({
      dropped: [],
      skipped: []
    });
    expect(drops()).toHaveLength(0);
  });

  it('keeps the name when a lookup rejects', async () => {
    getPullRequestMock.mockRejectedValue(new Error('rate limited'));
    const { fly, drops } = setup({ databases: 'cdwr_cms_1', roles: '' });

    await expect(runDestroyDatabases('t', fly, options)).resolves.toEqual({
      dropped: [],
      skipped: []
    });
    expect(drops()).toHaveLength(0);
  });

  it('looks up each PR once per run', async () => {
    prStates[575] = 'closed';
    const { fly } = setup({
      databases: 'cdwr_cms_575',
      roles: 'cdwr_cms_pr_575\ncdwr_cms_pr_575_moon\ncdwr_cms_pr_575_sun'
    });

    await runDestroyDatabases('t', fly, options);

    expect(getPullRequestMock).toHaveBeenCalledTimes(1);
  });
});

describe('reportVolumeUsage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const dfOutput = (percent: string) =>
    `Filesystem 1024-blocks Used Available Capacity Mounted on\n/dev/vdb 1000000 ${percent.replace('%', '')}0000 100000 ${percent} /data\n`;

  const flyWith = (impl: () => Promise<string>) =>
    ({ ssh: { exec: vi.fn(impl) } }) as unknown as Fly;

  it('parses df output and reports below the threshold', async () => {
    const used = await reportVolumeUsage(
      flyWith(async () => dfOutput('42%')),
      'pg'
    );

    expect(used).toBe(42);
    expect(core.warning).not.toHaveBeenCalled();
    expect(core.info).toHaveBeenCalledWith(expect.stringContaining('42%'));
  });

  it('warns at 80% or more', async () => {
    const used = await reportVolumeUsage(
      flyWith(async () => dfOutput('80%')),
      'pg'
    );

    expect(used).toBe(80);
    expect(core.warning).toHaveBeenCalledWith(
      expect.stringContaining('80% used')
    );
  });

  it('returns null on garbage', async () => {
    const used = await reportVolumeUsage(
      flyWith(async () => 'nothing useful here'),
      'pg'
    );

    expect(used).toBeNull();
    expect(core.warning).toHaveBeenCalled();
  });

  it('returns null when the command fails', async () => {
    const used = await reportVolumeUsage(
      flyWith(async () => {
        throw new Error('ssh down');
      }),
      'pg'
    );

    expect(used).toBeNull();
  });
});
