import { describe, expect, it } from 'vitest';

import {
  formatContainerJob,
  parseListener,
  parseRemoteStatus,
  remoteStatus,
  rmLockCommand,
  skewedStatus,
  staleScriptsHint,
  unreadableStatus
} from './status.logic';

const report = {
  job: { loaded: false },
  paused: false,
  notifyLevel: 'action',
  host: 'container',
  keySource: 'env',
  keyPresent: true,
  mirror: null,
  script: 'current',
  installedAny: true,
  watching: [{ ticket: 'COD-1', pr: 2, state: 'open' }],
  worktree: { path: '/w', exists: true },
  lastScheduled: null,
  lockState: 'free',
  lock: '/l',
  implement: { cap: 40, budget: 15 },
  next: null,
  attended: null,
  suggest: null,
  queueView: null
};
const envelope = JSON.stringify({
  ok: true,
  command: 'agent status',
  plan: {},
  result: report
});

describe('remoteStatus', () => {
  it('runs status through secrets.sh in the container, one argv entry each', () => {
    expect(remoteStatus('agent-host')).toEqual([
      'agent-host',
      'docker',
      'exec',
      '-w',
      '/work/codeware-agent',
      'cdwr-agent',
      '/opt/agent-host/secrets.sh',
      'node',
      'tools/cdwr/bin/cdwr.mjs',
      'agent',
      'status',
      '--json'
    ]);
  });
});

describe('parseRemoteStatus', () => {
  it.each([
    ['bare envelope', envelope],
    [
      'secrets line before it',
      `secrets: production /agent-queue: 5 from the vault (A, B)\n${envelope}\n`
    ],
    ['two secrets lines', `secrets: a\nsecrets: kept: X\n${envelope}`]
  ])('reads %s', (_name, stdout) => {
    expect(parseRemoteStatus(stdout)).toMatchObject({
      kind: 'report',
      report: { host: 'container', keyPresent: true }
    });
  });

  it('reads the remote failure and its hint', () => {
    const line = JSON.stringify({
      ok: false,
      error: { message: 'No Linear key', hint: 'Set it', exitCode: 1 }
    });
    expect(parseRemoteStatus(`secrets: x\n${line}`)).toEqual({
      kind: 'failed',
      message: 'No Linear key',
      hint: 'Set it'
    });
  });

  it('reads a report from an older image without the implement budget', () => {
    const old = JSON.stringify({
      ok: true,
      result: { ...report, implement: { cap: 40 } }
    });
    expect(parseRemoteStatus(old)).toMatchObject({ kind: 'report' });
  });

  it('names the paths of a report that differs and keeps its line', () => {
    const line = JSON.stringify({
      result: { ...report, lockState: undefined }
    });
    expect(parseRemoteStatus(`secrets: x\n${line}`)).toEqual({
      kind: 'skew',
      paths: ['result.lockState'],
      line
    });
  });

  it.each([
    ['an empty answer', ''],
    ['garbage', 'bash: docker: command not found'],
    ['broken JSON', '{"ok":true,']
  ])('finds nothing in %s', (_name, stdout) => {
    expect(parseRemoteStatus(stdout)).toEqual({ kind: 'none' });
  });

  it.each([
    ['JSON without a report', '{"ok":true,"result":{"summary":"x"}}'],
    ['JSON of another shape', '[1,2]']
  ])('%s', (_name, stdout) => {
    expect(parseRemoteStatus(stdout).kind).toBe(
      stdout.startsWith('{') ? 'skew' : 'none'
    );
  });
});

describe('skewedStatus', () => {
  it('names the host, the first paths, the likely cause and the line, not the secrets line', () => {
    const text = skewedStatus('nuc', ['a', 'b', 'c', 'd'], '{"x":1}');
    expect(text).toContain('nuc');
    expect(text).toContain('a, b, c, ...');
    expect(text).toContain('different versions');
    expect(text).toContain('cdwr agent attend');
    expect(text).toContain('cdwr agent deploy --host nuc');
    expect(text.endsWith('Answer starts: {"x":1}')).toBe(true);
  });
});

describe('rmLockCommand', () => {
  it.each([
    [undefined, 'rmdir /l'],
    ['nuc', 'ssh nuc docker exec cdwr-agent rmdir /l']
  ])('with host %s', (host, text) => {
    expect(rmLockCommand('/l', host)).toBe(text);
  });
});

describe('unreadableStatus', () => {
  it('names the host and quotes the start of the answer', () => {
    expect(unreadableStatus('nuc', 'x'.repeat(300))).toBe(
      `The status answer from nuc could not be read: ${'x'.repeat(200)}...`
    );
  });

  it('says so when the answer is empty', () => {
    expect(unreadableStatus('nuc', '  ')).toContain('(empty)');
  });
});

describe('staleScriptsHint', () => {
  it.each([
    ['launchd', 're-run `cdwr agent install`'],
    [
      'container',
      're-deploy with `cdwr agent deploy --host <nuc>` from the Mac'
    ]
  ] as const)('on %s', (host, text) => {
    expect(staleScriptsHint(host)).toBe(text);
  });
});

describe('formatContainerJob', () => {
  const now = new Date('2026-10-29T12:00:00Z');
  const listener = (state: 'live' | 'down', lastBeat: string) => ({
    state,
    since: '2026-10-29T11:00:00Z',
    lastBeat,
    lastEvent: null,
    pid: 1
  });

  it('is live while the beat is fresh', () => {
    expect(
      formatContainerJob(listener('live', '2026-10-29T11:59:30Z'), now, 10, 60)
    ).toEqual({ ok: true, detail: 'live (events), fallback every 60 min' });
  });

  it('warns on a stale beat', () => {
    const job = formatContainerJob(
      listener('live', '2026-10-29T11:50:00Z'),
      now,
      10,
      60
    );
    expect(job.ok).toBe('warn');
    expect(job.detail).toMatch(/^polling every 10 min \(listener down since /);
  });

  it('warns on a down listener', () => {
    const job = formatContainerJob(
      listener('down', '2026-10-29T11:59:50Z'),
      now,
      10,
      60
    );
    expect(job.ok).toBe('warn');
    expect(job.detail).toContain('listener down since');
  });

  it('is fine without a listener file', () => {
    expect(formatContainerJob(null, now, 10, 60)).toEqual({
      ok: true,
      detail: 'polling every 10 min (no listener)'
    });
  });
});

describe('parseListener', () => {
  it('reads a listener file', () => {
    const text = JSON.stringify({
      state: 'live',
      since: 'a',
      lastBeat: 'b',
      lastEvent: null,
      pid: 3
    });
    expect(parseListener(text)?.pid).toBe(3);
  });

  it.each([[undefined], ['not json'], ['{}']])('gives null for %s', (text) => {
    expect(parseListener(text)).toBeNull();
  });
});
