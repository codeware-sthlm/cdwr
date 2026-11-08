import { describe, expect, it, vi } from 'vitest';

import {
  CommandError,
  PENDING_MAX_MS,
  REFUSED_SHOW_MS,
  type Reported,
  checkToken,
  controlStates,
  prCommandStates,
  sendCommand
} from './commands';

const URL_ = 'https://abcdefghij0123456789.supabase.co';

const answering = (status: number, body?: unknown) =>
  vi.fn<typeof fetch>(() =>
    Promise.resolve(
      new Response(body === undefined ? null : JSON.stringify(body), {
        status
      })
    )
  );

const target = (fetch: typeof globalThis.fetch) => ({
  supabaseUrl: URL_,
  controlToken: 'tok',
  fetch
});

const codeOf = async (promise: Promise<unknown>) => {
  try {
    await promise;
  } catch (error) {
    return error instanceof CommandError ? error.code : 'other';
  }
  return 'resolved';
};

describe('checkToken', () => {
  it('posts a body that is not JSON with the token as the bearer', async () => {
    const fetch = answering(400, { error: 'Not JSON' });
    await checkToken(target(fetch));
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe(`${URL_}/functions/v1/desk-command`);
    expect(init?.method).toBe('POST');
    expect((init?.headers as Record<string, string>)['Authorization']).toBe(
      'Bearer tok'
    );
    expect(() => JSON.parse(String(init?.body))).toThrow();
  });

  it.each([
    [401, 'unauthorized'],
    [500, 'server'],
    [202, 'server']
  ])('turns %i into %s', async (status, code) => {
    expect(await codeOf(checkToken(target(answering(status, {}))))).toBe(code);
  });

  it('reports a network failure', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(() =>
      Promise.reject(new TypeError('offline'))
    );
    expect(await codeOf(checkToken(target(fetch)))).toBe('network');
  });
});

describe('sendCommand', () => {
  it('sends the host, kind and value and returns the reply', async () => {
    const fetch = answering(202, { id: 7, status: 'pending', note: null });
    expect(
      await sendCommand(target(fetch), 'nuc', 'limit', { value: 4 })
    ).toEqual({
      id: 7,
      status: 'pending',
      note: null
    });
    expect(JSON.parse(String(fetch.mock.calls[0][1]?.body))).toEqual({
      host: 'nuc',
      kind: 'limit',
      args: { value: 4 }
    });
  });

  it('sends empty args for a kind without a value', async () => {
    const fetch = answering(200, {
      id: 8,
      status: 'refused',
      note: 'no scheduler reports from nuc'
    });
    expect(await sendCommand(target(fetch), 'nuc', 'pause')).toEqual({
      id: 8,
      status: 'refused',
      note: 'no scheduler reports from nuc'
    });
    expect(JSON.parse(String(fetch.mock.calls[0][1]?.body)).args).toEqual({});
  });

  it.each([
    [401, { error: 'Bad token' }, 'unauthorized'],
    [400, { error: 'Bad host' }, 'bad_request'],
    [500, { error: 'Write failed' }, 'server'],
    [202, { status: 'pending' }, 'server'],
    [200, { id: 1, status: 'done' }, 'server']
  ])('turns %i %j into %s', async (status, body, code) => {
    expect(
      await codeOf(sendCommand(target(answering(status, body)), 'nuc', 'run'))
    ).toBe(code);
  });

  it('carries the function’s error text', async () => {
    await expect(
      sendCommand(target(answering(400, { error: 'Bad host' })), 'nuc', 'run')
    ).rejects.toThrow('Bad host');
  });
});

describe('controlStates', () => {
  const AT = '2026-11-02T20:00:00Z';
  const EARLIER = '2026-11-02T19:59:59Z';
  const LATER = '2026-11-02T20:10:00Z';
  const NOW = Date.parse('2026-11-02T20:05:00Z');
  const row = (
    id: number,
    kind: string,
    status: string,
    extra: Partial<{
      host: string;
      at: string;
      applied_at: string;
      note: string;
      args: unknown;
    }> = {}
  ) => ({
    id,
    at: extra.at ?? AT,
    args: extra.args ?? {},
    host: extra.host ?? 'nuc',
    kind,
    status,
    applied_at: extra.applied_at ?? null,
    note: extra.note ?? null
  });
  const states = (
    rows: ReturnType<typeof row>[],
    queueAt: string | null = AT,
    now = NOW,
    reported: Partial<Reported> = {}
  ) =>
    controlStates(
      rows,
      'nuc',
      { at: queueAt, paused: true, limit: 5, cap: 40, ...reported },
      now
    );

  it('is idle without rows', () => {
    expect(states([]).run).toEqual({ state: 'idle' });
  });

  it('is pending while the newest row is pending', () => {
    expect(states([row(1, 'run', 'pending')]).run).toEqual({
      state: 'pending',
      kind: 'run'
    });
  });

  it('drops a pending row the scheduler would expire', () => {
    const late = NOW + PENDING_MAX_MS + 1000;
    expect(states([row(1, 'run', 'pending')], AT, late).run.state).toBe('idle');
  });

  it('stays pending once applied until queue_state is published at or after it', () => {
    const rows = [row(1, 'pause', 'applied', { applied_at: AT })];
    expect(states(rows, EARLIER).pause.state).toBe('pending');
    expect(states(rows, null).pause.state).toBe('pending');
    expect(states(rows, AT).pause.state).toBe('idle');
    expect(states(rows, LATER).pause.state).toBe('idle');
  });

  it('waits for the host to report the paused state and the value asked for', () => {
    const resume = [row(1, 'resume', 'applied', { applied_at: AT })];
    expect(states(resume, LATER).pause.state).toBe('pending');
    expect(states(resume, LATER, NOW, { paused: false }).pause.state).toBe(
      'idle'
    );
    const limit = [
      row(2, 'limit', 'applied', { applied_at: AT, args: { value: 8 } })
    ];
    expect(states(limit, LATER).limit.state).toBe('pending');
    expect(states(limit, LATER, NOW, { limit: 8 }).limit.state).toBe('idle');
    const cap = [
      row(3, 'cap', 'applied', { applied_at: AT, args: { value: 40 } })
    ];
    expect(states(cap, LATER).cap.state).toBe('idle');
  });

  it('shows a refusal with its note for a while', () => {
    const rows = [
      row(1, 'run', 'refused', { applied_at: AT, note: 'a run is in progress' })
    ];
    expect(states(rows).run).toEqual({
      state: 'refused',
      kind: 'run',
      note: 'a run is in progress'
    });
    expect(
      states(rows, AT, Date.parse(AT) + REFUSED_SHOW_MS + 1000).run.state
    ).toBe('idle');
  });

  it('reads the newest row per control; pause and resume share one', () => {
    const rows = [
      row(2, 'resume', 'pending'),
      row(1, 'pause', 'refused', { note: 'already paused' })
    ];
    expect(states(rows).pause).toEqual({ state: 'pending', kind: 'resume' });
  });

  it('treats an applied abandon as done', () => {
    expect(
      states([row(1, 'abandon', 'applied', { applied_at: AT })], EARLIER)
        .abandon
    ).toEqual({ state: 'idle' });
  });

  it('ignores snooze and wake rows', () => {
    const all = states([
      row(1, 'snooze', 'applied', {
        applied_at: AT,
        args: { ticket: 'COD-1', kind: 'review', eventAt: null }
      }),
      row(2, 'wake', 'refused', { note: 'not snoozed' })
    ]);
    expect(Object.values(all).every((s) => s.state === 'idle')).toBe(true);
  });

  it('ignores other hosts and unknown kinds', () => {
    const all = states([
      row(1, 'run', 'pending', { host: 'mac' }),
      row(2, 'reboot', 'pending'),
      row(3, 'toString', 'pending')
    ]);
    expect(Object.values(all).every((s) => s.state === 'idle')).toBe(true);
  });

  it('ignores copilot and merge rows', () => {
    const all = states([
      row(1, 'copilot', 'pending', { args: { ticket: 'COD-1', pr: 7 } }),
      row(2, 'merge', 'refused', { args: { ticket: 'COD-1', pr: 7 } })
    ]);
    expect(Object.values(all).every((s) => s.state === 'idle')).toBe(true);
  });
});

describe('prCommandStates', () => {
  const AT = '2026-11-02T20:00:00Z';
  const NOW = Date.parse('2026-11-02T20:05:00Z');
  const row = (
    id: number,
    kind: string,
    status: string,
    extra: Partial<{
      applied_at: string | null;
      note: string;
      args: unknown;
    }> = {}
  ) => ({
    id,
    at: AT,
    args: 'args' in extra ? extra.args : { ticket: 'COD-1', pr: 7 },
    host: 'nuc',
    kind,
    status,
    applied_at: extra.applied_at ?? null,
    note: extra.note ?? null
  });

  it('is empty without rows', () => {
    expect(prCommandStates([], NOW).size).toBe(0);
  });

  it('keeps a pending row for the scheduler expiry', () => {
    const rows = [row(1, 'merge', 'pending')];
    expect(prCommandStates(rows, NOW).get('COD-1 merge')).toEqual({
      state: 'pending'
    });
    expect(
      prCommandStates(rows, NOW + PENDING_MAX_MS + 1000).has('COD-1 merge')
    ).toBe(false);
  });

  it('shows a refusal with its note for a while', () => {
    const rows = [
      row(1, 'copilot', 'refused', { applied_at: AT, note: 'checks pending' })
    ];
    expect(prCommandStates(rows, NOW).get('COD-1 copilot')).toEqual({
      state: 'refused',
      note: 'checks pending'
    });
    expect(
      prCommandStates(rows, Date.parse(AT) + REFUSED_SHOW_MS + 1000).has(
        'COD-1 copilot'
      )
    ).toBe(false);
  });

  it('says refused when the refusal has no note', () => {
    const rows = [row(1, 'merge', 'refused', { applied_at: AT })];
    expect(prCommandStates(rows, NOW).get('COD-1 merge')).toEqual({
      state: 'refused',
      note: 'refused'
    });
  });

  it('shows an applied row for a while with when it was applied', () => {
    const rows = [row(1, 'merge', 'applied', { applied_at: AT })];
    expect(prCommandStates(rows, NOW).get('COD-1 merge')).toEqual({
      state: 'applied',
      at: AT
    });
    expect(
      prCommandStates(rows, Date.parse(AT) + REFUSED_SHOW_MS + 1000).has(
        'COD-1 merge'
      )
    ).toBe(false);
  });

  it('reads the newest row per ticket and kind', () => {
    const rows = [
      row(2, 'merge', 'pending'),
      row(1, 'merge', 'refused', { applied_at: AT, note: 'old' }),
      row(3, 'copilot', 'applied', { applied_at: AT }),
      row(4, 'merge', 'pending', { args: { ticket: 'COD-2', pr: 8 } })
    ];
    const states = prCommandStates(rows, NOW);
    expect(states.get('COD-1 merge')).toEqual({ state: 'pending' });
    expect(states.get('COD-1 copilot')?.state).toBe('applied');
    expect(states.get('COD-2 merge')).toEqual({ state: 'pending' });
    expect(states.size).toBe(3);
  });

  it('ignores other kinds and rows without a ticket', () => {
    const states = prCommandStates(
      [
        row(1, 'snooze', 'pending'),
        row(2, 'run', 'pending'),
        row(3, 'merge', 'pending', { args: {} }),
        row(4, 'merge', 'pending', { args: null })
      ],
      NOW
    );
    expect(states.size).toBe(0);
  });
});
