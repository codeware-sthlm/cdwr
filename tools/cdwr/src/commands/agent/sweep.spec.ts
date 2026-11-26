import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { EXIT } from '../../cli/errors';
import { memoryPrefs } from '../../cli/prefs';
import { runCommand } from '../../cli/run';
import { fakeUi } from '../../testing/fake-ui';

vi.mock('../../cli/preflight', () => ({ preflight: vi.fn() }));

const mocks = vi.hoisted(() => ({ list: vi.fn(), githubGet: vi.fn() }));

vi.mock('../../services/fly', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/fly')>()),
  fly: () => ({ apps: { list: mocks.list } })
}));

vi.mock('./platform.collect', () => ({
  GITHUB_TOKEN_ENV: 'PLATFORM_GITHUB_TOKEN',
  githubGet: mocks.githubGet
}));

interface Written {
  at: string;
  findings: { key: string; rule: string; subject: string }[];
  unchecked: { rule: string; reason: string }[];
  new: string[];
  known: string[];
  apps: Record<string, string>;
}

describe('agent sweep', () => {
  let home: string;
  let ui: ReturnType<typeof fakeUi>;

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'cdwr-agent-sweep-'));
    mocks.list.mockReset();
    mocks.githubGet.mockReset();
    mocks.list.mockResolvedValue([]);
    mocks.githubGet.mockResolvedValue({ state: 'open' });
    ui = fakeUi([]);
  });
  afterEach(() => rmSync(home, { recursive: true, force: true }));

  async function sweep(vars: Record<string, string>) {
    const command = (await import('./sweep')).default;
    const exit = await runCommand({
      name: 'agent sweep',
      command,
      argv: ['--yes'],
      root: '/ws/codeware',
      env: vars,
      prefs: memoryPrefs(),
      interactive: false,
      ui,
      history: () => undefined,
      stdout: () => undefined
    });
    return { exit };
  }

  const run = () => sweep({ AGENT_QUEUE_HOME: home });

  const written = () =>
    JSON.parse(readFileSync(join(home, 'sweep.json'), 'utf8')) as Written;

  const ORPHAN = 'orphan-app:cdwr-cms-pr-737';

  it('writes sweep.json with findings, unchecked rules and the apps', async () => {
    mocks.list.mockResolvedValue([
      { name: 'cdwr-cms-pr-737', status: 'deployed', extra: 1 },
      { name: 'cdwr-cms', status: 'pending' }
    ]);
    mocks.githubGet.mockResolvedValue({ state: 'closed' });

    const { exit } = await run();
    expect(exit).toBe(EXIT.ok);
    const body = written();
    expect(body.findings.map(({ key }) => key)).toEqual([ORPHAN]);
    expect(body.unchecked).toEqual([
      { rule: 'orphan-database', reason: 'no pg-preview access' },
      { rule: 'orphan-role', reason: 'no pg-preview access' },
      { rule: 'preview-volume', reason: 'no pg-preview access' }
    ]);
    expect(body.apps).toEqual({
      'cdwr-cms-pr-737': 'deployed',
      'cdwr-cms': 'pending'
    });
    expect(body.new).toEqual([ORPHAN]);
    expect(body.known).toEqual([ORPHAN]);
    expect(statSync(join(home, 'sweep.json')).mode & 0o777).toBe(0o600);
  });

  it('sorts the known keys', async () => {
    mocks.list.mockResolvedValue([
      { name: 'cdwr-cms-pr-9', status: 'deployed' },
      { name: 'cdwr-cms-pr-10', status: 'deployed' }
    ]);
    mocks.githubGet.mockResolvedValue({ state: 'closed' });
    await run();
    expect(written().known).toEqual([
      'orphan-app:cdwr-cms-pr-10',
      'orphan-app:cdwr-cms-pr-9'
    ]);
  });

  it('reports a finding as new once, and again after it cleared', async () => {
    mocks.list.mockResolvedValue([
      { name: 'cdwr-cms-pr-737', status: 'deployed' }
    ]);
    mocks.githubGet.mockResolvedValue({ state: 'closed' });

    await run();
    expect(written().new).toEqual([ORPHAN]);

    await run();
    expect(written().new).toEqual([]);
    expect(written().known).toEqual([ORPHAN]);

    mocks.list.mockResolvedValue([]);
    await run();
    expect(written().new).toEqual([]);
    expect(written().known).toEqual([]);

    mocks.list.mockResolvedValue([
      { name: 'cdwr-cms-pr-737', status: 'deployed' }
    ]);
    await run();
    expect(written().new).toEqual([ORPHAN]);
  });

  it('keeps the keys of an unchecked rule known', async () => {
    mocks.list.mockResolvedValue([
      { name: 'cdwr-cms-pr-737', status: 'deployed' }
    ]);
    mocks.githubGet.mockResolvedValue({ state: 'closed' });
    await run();

    mocks.list.mockRejectedValue(new Error('fly is down'));
    await run();
    const outage = written();
    expect(outage.findings).toEqual([]);
    expect(outage.unchecked.map(({ rule }) => rule)).toContain('orphan-app');
    expect(outage.known).toEqual([ORPHAN]);
    expect(outage.new).toEqual([]);
    // the apps map of the last good read stays for pending-app
    expect(outage.apps).toEqual({ 'cdwr-cms-pr-737': 'deployed' });

    mocks.list.mockResolvedValue([
      { name: 'cdwr-cms-pr-737', status: 'deployed' }
    ]);
    await run();
    expect(written().findings).toHaveLength(1);
    expect(written().new).toEqual([]);
  });

  it('finds an app pending in the previous sweep too', async () => {
    writeFileSync(
      join(home, 'sweep.json'),
      JSON.stringify({ apps: { 'cdwr-cms-pr-5': 'pending' }, known: [] })
    );
    mocks.list.mockResolvedValue([
      { name: 'cdwr-cms-pr-5', status: 'pending' }
    ]);

    await run();
    const body = written();
    expect(body.findings.map(({ key }) => key)).toEqual([
      'pending-app:cdwr-cms-pr-5'
    ]);
    expect(body.new).toEqual(['pending-app:cdwr-cms-pr-5']);
  });

  it('reads the spend ledger from the home', async () => {
    writeFileSync(
      join(home, 'implement-spend.jsonl'),
      `${JSON.stringify({ day: '2026-01-01', cost: 1 })}\nnot json\n`
    );
    await run();
    expect(written().findings.map(({ key }) => key)).toEqual([
      'spend-ledger:line-2'
    ]);
  });

  it('reads each pull request once, signed, and no answer leaves the rule unchecked', async () => {
    mocks.list.mockResolvedValue([
      { name: 'cdwr-cms-pr-7', status: 'deployed' },
      { name: 'cdwr-cms-pr-7-moon', status: 'deployed' },
      { name: 'cdwr-cms-pr-8', status: 'deployed' }
    ]);
    mocks.githubGet.mockImplementation(async (path: string) => {
      if (path === '/pulls/8') throw new Error('rate limited');
      return { state: 'closed' };
    });

    const { exit } = await sweep({
      AGENT_QUEUE_HOME: home,
      PLATFORM_GITHUB_TOKEN: 'ghs_token'
    });
    expect(exit).toBe(EXIT.ok);
    expect(mocks.githubGet).toHaveBeenCalledTimes(2);
    expect(mocks.githubGet).toHaveBeenCalledWith(
      '/pulls/7',
      expect.anything(),
      'ghs_token'
    );
    expect(mocks.githubGet).toHaveBeenCalledWith(
      '/pulls/8',
      expect.anything(),
      'ghs_token'
    );
    expect(written().findings).toEqual([]);
    expect(written().unchecked).toContainEqual({
      rule: 'orphan-app',
      reason: 'the state of PR 8 is unknown'
    });
  });

  it('writes nothing without a queue home', async () => {
    const { exit } = await sweep({});
    expect(exit).toBe(EXIT.ok);
    expect(existsSync(join(home, 'sweep.json'))).toBe(false);
  });
});
