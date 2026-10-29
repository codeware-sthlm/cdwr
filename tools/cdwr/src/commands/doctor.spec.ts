import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { memoryPrefs } from '../cli/prefs';
import { runCommand } from '../cli/run';
import { fakeUi } from '../testing/fake-ui';

import type { QueuePaths } from './agent/agent.logic';

vi.mock('../cli/preflight', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../cli/preflight')>();
  return {
    ...actual,
    check: (need: string) => ({ need, ok: true, detail: '' })
  };
});
vi.mock('./completion', () => ({ shellOf: () => null }));
vi.mock('./agent/agent.logic', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./agent/agent.logic')>()),
  hostKind: () => 'launchd'
}));

let loaded = false;
let queue: QueuePaths;
const jobPathChecks = vi.fn();
const githubAppCheck = vi.fn();

vi.mock('../services/agent-queue', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/agent-queue')>()),
  jobState: async () => ({ loaded }),
  keyPresent: async () => true,
  paths: () => queue,
  queueDrift: () => 'missing',
  worktreeOf: () => '/nowhere',
  envCopyDrift: () => 'current',
  implementReport: () => ({ spent: undefined, cap: 40, last: undefined }),
  jobPathChecks: (...args: unknown[]) => jobPathChecks(...args),
  githubAppCheck: (...args: unknown[]) => githubAppCheck(...args)
}));

describe('doctor on a machine without the scheduler', () => {
  let dir: string;

  beforeEach(() => {
    jobPathChecks.mockReset();
    githubAppCheck.mockReset();
    loaded = false;
    dir = mkdtempSync(join(tmpdir(), 'cdwr-doctor-'));
    queue = {
      home: join(dir, 'agent-queue'),
      mirror: join(dir, 'agent-queue', 'mirror'),
      plist: join(dir, 'queue.plist')
    } as QueuePaths;
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  async function doctor() {
    const ui = fakeUi([]);
    const command = (await import('./doctor')).default;
    await runCommand({
      name: 'doctor',
      command,
      argv: [],
      root: dir,
      env: {},
      prefs: memoryPrefs(),
      interactive: false,
      ui,
      history: () => undefined,
      stdout: () => undefined
    });
    return ui.printed.write.join('\n');
  }

  it('names the mirror host and skips the job checks', async () => {
    mkdirSync(queue.home, { recursive: true });
    writeFileSync(queue.mirror, 'nuc:docker:cdwr-agent:/d\n');
    const text = await doctor();
    expect(text).toContain('agent queue');
    expect(text).toContain('runs on nuc');
    expect(text).not.toContain('cdwr agent install');
    expect(jobPathChecks).not.toHaveBeenCalled();
    expect(githubAppCheck).not.toHaveBeenCalled();
  });

  it('warns without a mirror, still not asking for an install', async () => {
    const text = await doctor();
    expect(text).toContain('not on this machine');
    expect(text).not.toContain('cdwr agent install');
  });
});
