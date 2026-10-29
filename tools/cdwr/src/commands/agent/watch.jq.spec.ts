import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const DIR = fileURLToPath(new URL('../../../agent-queue', import.meta.url));

// Runs `expr` against `input` through the real jq with the watch module included
const run = (expr: string, input: unknown = null): unknown => {
  const res = spawnSync('jq', ['-c', '-L', DIR, `include "watch"; ${expr}`], {
    input: JSON.stringify(input),
    encoding: 'utf8'
  });
  if (res.status !== 0) throw new Error(res.stderr);
  return JSON.parse(res.stdout);
};

const PR = 'https://github.com/codeware-sthlm/cdwr/pull';

const issue = (
  attachments: Array<{ url: string; createdAt: string }> = [],
  comments: Array<{ body: string; createdAt: string }> = []
) => ({
  identifier: 'COD-1',
  attachments: { nodes: attachments },
  comments: { nodes: comments }
});

describe('pr_number', () => {
  it.each([
    [
      'newest matching wins',
      [
        { url: `${PR}/10`, createdAt: '2026-01-01T00:00:00Z' },
        { url: `${PR}/12`, createdAt: '2026-02-01T00:00:00Z' },
        { url: `${PR}/11`, createdAt: '2026-01-15T00:00:00Z' }
      ],
      12
    ],
    [
      'other repos and hosts ignored',
      [
        {
          url: 'https://github.com/codeware-sthlm/other/pull/99',
          createdAt: '2026-03-01T00:00:00Z'
        },
        {
          url: 'https://example.com/pull/98',
          createdAt: '2026-03-02T00:00:00Z'
        },
        { url: `${PR}/7`, createdAt: '2026-01-01T00:00:00Z' }
      ],
      7
    ],
    [
      'suffix after the number ignored',
      [{ url: `${PR}/12/files`, createdAt: '2026-01-01T00:00:00Z' }],
      12
    ],
    [
      'fragment ignored',
      [{ url: `${PR}/13#discussion_r1`, createdAt: '2026-01-01T00:00:00Z' }],
      13
    ],
    ['no attachments', [], null],
    [
      'nothing matches',
      [{ url: 'https://linear.app/x', createdAt: '2026-01-01T00:00:00Z' }],
      null
    ]
  ])('%s', (_name, attachments, expected) => {
    expect(run('pr_number', issue(attachments))).toBe(expected);
  });

  it('missing attachments gives null', () => {
    expect(run('pr_number', { identifier: 'COD-1' })).toBeNull();
  });
});

describe('handoffs', () => {
  const ready = (body: string, createdAt = '2026-01-01T00:00:00Z') => ({
    body: `**Agent: PR ready**: ${PR}/569\n\n${body}`,
    createdAt
  });
  const h = (...comments: Array<{ body: string; createdAt: string }>) =>
    run('handoffs', issue([], comments));

  it('parses the real example', () => {
    const c = {
      body: `**Agent: PR ready**: ${PR}/569\n\nCI is green.\n\nHand-off checklist:\n- [ ] After merge, run \`cdwr agent install\` again so the scheduler uses the new \`run.sh\`.`,
      createdAt: '2026-01-01T00:00:00Z'
    };
    expect(h(c)).toEqual([
      'After merge, run `cdwr agent install` again so the scheduler uses the new `run.sh`.'
    ]);
  });

  it('skips checked items', () => {
    expect(
      h(ready('Hand-off checklist:\n- [x] done\n- [ ] open\n- [X] also done'))
    ).toEqual(['open']);
  });

  it('accepts mixed bullets and blank lines', () => {
    expect(
      h(ready('Hand-off checklist:\n\n* [ ] one\n- [ ] two  \n\n  - [ ] three'))
    ).toEqual(['one', 'two', 'three']);
  });

  it('accepts a bold header, any case', () => {
    expect(h(ready('**Hand-off checklist:**\n- [ ] a'))).toEqual(['a']);
    expect(h(ready('HAND-OFF CHECKLIST:\n- [ ] b'))).toEqual(['b']);
  });

  it('stops at the following paragraph', () => {
    expect(
      h(ready('Hand-off checklist:\n- [ ] a\nNotes follow.\n- [ ] not mine'))
    ).toEqual(['a']);
  });

  it('newest PR-ready comment wins', () => {
    expect(
      h(
        ready('Hand-off checklist:\n- [ ] new', '2026-02-01T00:00:00Z'),
        ready('Hand-off checklist:\n- [ ] old', '2026-01-01T00:00:00Z')
      )
    ).toEqual(['new']);
  });

  it('a later plain comment does not hide it', () => {
    expect(
      h(ready('Hand-off checklist:\n- [ ] a'), {
        body: 'Looks good',
        createdAt: '2026-03-01T00:00:00Z'
      })
    ).toEqual(['a']);
  });

  it.each([
    ['no comments', []],
    [
      'no PR-ready comment',
      [
        {
          body: 'Hand-off checklist:\n- [ ] a',
          createdAt: '2026-01-01T00:00:00Z'
        }
      ]
    ],
    ['no header', [ready('CI is green.\n- [ ] a')]],
    ['only done items', [ready('Hand-off checklist:\n- [x] a')]],
    ['empty checklist', [ready('Hand-off checklist:')]]
  ])('%s gives []', (_name, comments) => {
    expect(h(...comments)).toEqual([]);
  });
});

describe('pr_state', () => {
  const pr = (over: Record<string, unknown> = {}, rollup?: string | null) => ({
    state: 'OPEN',
    mergeQueueEntry: null,
    commits: {
      nodes: [
        {
          commit: {
            statusCheckRollup: rollup == null ? null : { state: rollup }
          }
        }
      ]
    },
    timelineItems: { nodes: [] },
    ...over
  });
  const state = (p: unknown) => (run('pr_state', p) as { state: string }).state;

  it.each([
    ['merged', pr({ state: 'MERGED' }, 'SUCCESS'), 'merged'],
    ['merged beats failing', pr({ state: 'MERGED' }, 'FAILURE'), 'merged'],
    ['closed', pr({ state: 'CLOSED' }, 'SUCCESS'), 'closed'],
    ['closed beats failing', pr({ state: 'CLOSED' }, 'FAILURE'), 'closed'],
    ['failing', pr({}, 'FAILURE'), 'failing'],
    ['error is failing', pr({}, 'ERROR'), 'failing'],
    [
      'failing beats queued',
      pr({ mergeQueueEntry: { state: 'QUEUED' } }, 'FAILURE'),
      'failing'
    ],
    [
      'queued',
      pr({ mergeQueueEntry: { state: 'QUEUED' } }, 'SUCCESS'),
      'queued'
    ],
    ['open', pr({}, 'SUCCESS'), 'open'],
    ['pending is open', pr({}, 'PENDING'), 'open'],
    ['null rollup is open', pr({}, null), 'open'],
    ['no commits is open', pr({ commits: null }), 'open'],
    ['empty commits is open', pr({ commits: { nodes: [] } }), 'open']
  ])('%s', (_name, input, expected) => {
    expect(state(input)).toBe(expected);
  });

  it('carries the last removal event', () => {
    expect(
      run(
        'pr_state',
        pr({
          timelineItems: {
            nodes: [
              { reason: 'FAILED_CHECKS', createdAt: '2026-01-01T00:00:00Z' }
            ]
          }
        })
      )
    ).toEqual({
      state: 'open',
      removedAt: '2026-01-01T00:00:00Z',
      removedReason: 'FAILED_CHECKS',
      unresolved: 0
    });
  });

  it('has null removal fields without an event', () => {
    expect(run('pr_state', pr())).toEqual({
      state: 'open',
      removedAt: null,
      removedReason: null,
      unresolved: 0
    });
  });

  const thread = (resolved: boolean, type: string, body: string) => ({
    isResolved: resolved,
    comments: { nodes: [{ author: { __typename: type }, body }] }
  });
  it.each([
    ['a person spoke last', [thread(false, 'User', 'Please rename')], 1],
    ['resolved threads', [thread(true, 'User', 'Please rename')], 0],
    ['Copilot threads', [thread(false, 'Bot', 'Consider…')], 0],
    [
      'threads the agent left open',
      [thread(false, 'User', '**Agent:** My reading: …')],
      0
    ],
    [
      'a deleted author counts as a person',
      [
        {
          isResolved: false,
          comments: { nodes: [{ author: null, body: 'x' }] }
        }
      ],
      1
    ],
    [
      'several',
      [
        thread(false, 'User', 'a'),
        thread(false, 'User', 'b'),
        thread(false, 'Bot', 'c')
      ],
      2
    ]
  ])('counts unresolved review threads: %s', (_name, nodes, expected) => {
    expect(
      (
        run('pr_state', pr({ reviewThreads: { nodes } })) as {
          unresolved: number;
        }
      ).unresolved
    ).toBe(expected);
  });
});

describe('step', () => {
  type Now = {
    state: string;
    removedAt: string | null;
    removedReason: string | null;
    unresolved?: number;
  };
  type Prev = { pr: number; state: string; removedAt: string | null } | null;

  const now = (state: string, over: Partial<Now> = {}): Now => ({
    state,
    removedAt: null,
    removedReason: null,
    ...over
  });
  const prev = (
    state: string,
    removedAt: string | null = null,
    p = 5
  ): Prev => ({
    pr: p,
    state,
    removedAt
  });
  const step = (n: Now, p: Prev, handoffs: string[] = []) =>
    run('step', {
      id: 'COD-9',
      pr: 5,
      now: n,
      prev: p,
      handoffs,
      at: '2026-05-01T00:00:00Z'
    }) as {
      notices: Array<{ level: string; message: string }>;
      entry: Record<string, unknown>;
    };

  it.each([
    ['open', 'failing', 'action', 'COD-9: PR #5 has failing checks'],
    ['queued', 'failing', 'action', 'COD-9: PR #5 has failing checks'],
    ['open', 'closed', 'info', 'COD-9: PR #5 closed without merging'],
    ['queued', 'closed', 'info', 'COD-9: PR #5 closed without merging'],
    ['open', 'merged', 'info', 'COD-9: PR #5 merged'],
    ['queued', 'merged', 'info', 'COD-9: PR #5 merged']
  ])('%s -> %s', (from, to, level, message) => {
    expect(step(now(to), prev(from)).notices).toEqual([{ level, message }]);
  });

  it.each([
    ['open', 'queued'],
    ['failing', 'open'],
    ['failing', 'queued'],
    ['queued', 'open']
  ])('%s -> %s is silent', (from, to) => {
    expect(step(now(to), prev(from)).notices).toEqual([]);
  });

  it('merged with hand-offs left is an action', () => {
    expect(
      step(now('merged'), prev('open'), ['run install', 'check logs']).notices
    ).toEqual([
      {
        level: 'action',
        message: 'COD-9 merged: hand-offs left: run install; check logs'
      }
    ]);
  });

  it('first sight of a merged PR, with and without hand-offs', () => {
    expect(step(now('merged'), null).notices).toEqual([
      { level: 'info', message: 'COD-9: PR #5 merged' }
    ]);
    expect(step(now('merged'), null, ['x']).notices).toEqual([
      { level: 'action', message: 'COD-9 merged: hand-offs left: x' }
    ]);
  });

  it('first sight of a failing PR notifies', () => {
    expect(step(now('failing'), null).notices).toEqual([
      { level: 'action', message: 'COD-9: PR #5 has failing checks' }
    ]);
  });

  it('first sight of an open PR is silent', () => {
    expect(step(now('open'), null).notices).toEqual([]);
  });

  describe('removal', () => {
    const removed = (reason: string | null, at = '2026-04-01T00:00:00Z') => ({
      removedAt: at,
      removedReason: reason
    });

    it('newer than prev notifies with a readable reason', () => {
      expect(
        step(
          now('open', removed('FAILED_CHECKS')),
          prev('queued', '2026-03-01T00:00:00Z')
        ).notices
      ).toEqual([
        {
          level: 'action',
          message: 'COD-9: PR #5 left the merge queue (failed checks)'
        }
      ]);
    });

    it('first removal (prev has none) notifies', () => {
      expect(
        step(now('open', removed('MERGE_CONFLICT')), prev('queued')).notices
      ).toHaveLength(1);
    });

    it.each([null, ''])('reason %j reads "no reason given"', (reason) => {
      expect(
        step(now('open', removed(reason)), prev('queued')).notices[0].message
      ).toBe('COD-9: PR #5 left the merge queue (no reason given)');
    });

    it('same as prev is silent', () => {
      expect(
        step(
          now('open', removed('FAILED_CHECKS')),
          prev('open', '2026-04-01T00:00:00Z')
        ).notices
      ).toEqual([]);
    });

    it.each(['merged', 'closed'])('is suppressed when %s', (state) => {
      expect(
        step(now(state, removed('FAILED_CHECKS')), prev('queued')).notices
      ).toHaveLength(1);
      expect(
        step(now(state, removed('FAILED_CHECKS')), prev('queued')).notices[0]
          .message
      ).not.toMatch(/merge queue/);
    });

    it('a merge out of the queue is no removal', () => {
      expect(
        step(now('queued', removed('merged')), prev('queued')).notices
      ).toEqual([]);
    });

    it('with failing in the same step gives one notice', () => {
      const notices = step(
        now('failing', removed('FAILED_CHECKS')),
        prev('queued')
      ).notices;
      expect(notices).toEqual([
        {
          level: 'action',
          message: 'COD-9: PR #5 left the merge queue (failed checks)'
        }
      ]);
    });
  });

  it('a different PR number resets prev', () => {
    expect(
      step(now('failing'), prev('failing', '2026-09-01T00:00:00Z', 4)).notices
    ).toEqual([
      { level: 'action', message: 'COD-9: PR #5 has failing checks' }
    ]);
  });

  describe('entry', () => {
    it('carries the unresolved review threads', () => {
      expect(
        step(now('open', { unresolved: 2 }), null).entry['unresolved']
      ).toBe(2);
    });

    it('records pr, state, removedAt and at', () => {
      expect(
        step(
          now('queued', {
            removedAt: '2026-04-01T00:00:00Z',
            removedReason: 'X'
          }),
          null
        ).entry
      ).toEqual({
        pr: 5,
        state: 'queued',
        removedAt: '2026-04-01T00:00:00Z',
        unresolved: 0,
        at: '2026-05-01T00:00:00Z'
      });
    });

    it('keeps the old removedAt without a new event', () => {
      expect(
        step(now('open'), prev('open', '2026-03-01T00:00:00Z')).entry
      ).toEqual({
        pr: 5,
        state: 'open',
        removedAt: '2026-03-01T00:00:00Z',
        unresolved: 0,
        at: '2026-05-01T00:00:00Z'
      });
    });

    it('is null removedAt when neither has one', () => {
      expect(step(now('open'), null).entry['removedAt']).toBeNull();
    });
  });

  describe('no repeat notices', () => {
    it.each(['failing', 'merged', 'closed', 'open', 'queued'])(
      '%s twice is silent',
      (state) => {
        expect(step(now(state), prev(state)).notices).toEqual([]);
      }
    );

    // The second step reads the entry the first one produced, as run.sh does
    it.each([
      ['merged', now('merged'), []],
      ['merged with hand-offs', now('merged'), ['run install']],
      ['failing', now('failing'), []],
      [
        'removed from the merge queue',
        now('open', {
          removedAt: '2026-04-01T00:00:00Z',
          removedReason: 'FAILED_CHECKS'
        }),
        []
      ]
    ])('%s: an identical observation repeated is silent', (_name, n, h) => {
      const first = step(n, prev('queued'), h);
      expect(first.notices.length).toBeGreaterThan(0);
      expect(step(n, first.entry as Prev, h).notices).toEqual([]);
    });

    it('failing -> open -> failing notifies twice over three steps', () => {
      const states = ['failing', 'open', 'failing'];
      let p: Prev = prev('open');
      const counts = states.map((s) => {
        const r = step(now(s), p);
        p = r.entry as Prev;
        return r.notices.length;
      });
      expect(counts).toEqual([1, 0, 1]);
    });
  });
});

describe('prune', () => {
  const state = {
    'COD-1': { pr: 1, state: 'open', removedAt: null, at: 'a' },
    'COD-2': { pr: 2, state: 'merged', removedAt: null, at: 'b' }
  };

  it('keeps listed ids and drops the rest', () => {
    expect(run('prune(["COD-2", "COD-3"])', state)).toEqual({
      'COD-2': state['COD-2']
    });
  });

  it('empty list drops everything', () => {
    expect(run('prune([])', state)).toEqual({});
  });

  it('null input gives {}', () => {
    expect(run('prune(["COD-1"])', null)).toEqual({});
  });
});

describe('epoch', () => {
  it.each([
    ['plain', '2026-10-10T18:49:25Z', 1791658165],
    ['with millis', '2026-10-10T18:49:25.765Z', 1791658165],
    ['without seconds', '2026-10-10T18:49Z', 1791658140]
  ])('%s', (_name, iso, expected) => {
    expect(run(`"${iso}" | epoch`)).toBe(expected);
  });
});

describe('attended picks', () => {
  const NOW = Date.parse('2026-10-11T12:00:00Z') / 1000;
  const iso = (secondsAgo: number) =>
    new Date((NOW - secondsAgo) * 1000).toISOString().replace(/\.\d+Z$/, 'Z');
  const HOUR = 3600;
  const DAY = 86400;

  type Node = ReturnType<typeof node>;
  const node = (
    id: string,
    label: string | null,
    over: Record<string, unknown> = {}
  ) => ({
    identifier: id,
    priority: 3,
    createdAt: '2026-01-01T00:00:00.000Z',
    completedAt: null as string | null,
    state: { type: 'unstarted' },
    labels: { nodes: label ? [{ name: label }] : [] },
    description: null as string | null,
    comments: { nodes: [] as Array<{ body: string; createdAt: string }> },
    inverseRelations: { nodes: [] as unknown[] },
    ...over
  });
  const ready = (id: string, over: Record<string, unknown> = {}) =>
    node(id, 'agent:ready', over);
  const claimLine = (ago: number, path = '`/work/cod-1`', id = 'sess-1') =>
    `Status\n\n**Claim:** ${id} · ${path} · ${iso(ago).slice(0, 16)}Z\n**Next:** step 2\n`;
  const prReady = (checklist = true, createdAt = '2026-09-01T00:00:00Z') => ({
    body: `**Agent: PR ready**: ${PR}/1\n\n${checklist ? 'Hand-off checklist:\n- [ ] check' : 'Done'}`,
    createdAt
  });
  const review = (id: string, over: Record<string, unknown> = {}) =>
    node(id, 'agent:review', over);

  const attended = (
    issues: Node[],
    limit = 5,
    watch: Record<string, unknown> = {}
  ) =>
    run(`attended(${NOW}; ${limit}; ${JSON.stringify(watch)})`, issues) as {
      verdict: string;
      ticket: string | null;
      reason: string | null;
      detail: string | null;
      waiting: string[];
      used: number;
      limit: number;
    };
  const line = (issues: Node[], limit = 5, watch = {}) =>
    run(
      `attended(${NOW}; ${limit}; ${JSON.stringify(watch)}) | attended_line`,
      issues
    );

  describe('claim', () => {
    it.each([
      [
        'backticked path',
        'x\n**Claim:** s1 · `/a/b` · 2026-10-11T10:30Z',
        's1'
      ],
      ['plain path', '**Claim:** s2 · /a/b · 2026-10-11T10:30Z\nmore', 's2']
    ])('%s', (_name, description, id) => {
      expect(run('claim', node('COD-1', null, { description }))).toEqual({
        id,
        at: Date.parse('2026-10-11T10:30:00Z') / 1000
      });
    });

    it.each([null, 'no claim here', '**Claim:** broken'])(
      'null for %j',
      (description) => {
        expect(run('claim', node('COD-1', null, { description }))).toBeNull();
      }
    );
  });

  it('next_line is trimmed or null', () => {
    expect(
      run(
        'next_line',
        node('A', null, { description: 'x\n**Next:** go on  \ny' })
      )
    ).toBe('go on');
    expect(run('next_line', node('A', null))).toBeNull();
  });

  // A plan may mention the marker mid-sentence; only a line that starts with it counts
  it('next_line skips the marker inside a line', () => {
    expect(
      run(
        'next_line',
        node('A', null, {
          description: 'its **Next:** line is read\n**Next:** step 3\n'
        })
      )
    ).toBe('step 3');
  });

  describe('running and take over', () => {
    it('fresh claim is running with next line', () => {
      const r = attended([
        node('COD-1', 'agent:working', { description: claimLine(HOUR) }),
        ready('COD-2')
      ]);
      expect(r).toMatchObject({
        verdict: 'running',
        ticket: 'COD-1',
        reason: 'working',
        detail: 'step 2'
      });
    });

    it('newest of several fresh claims', () => {
      const r = attended([
        node('COD-1', 'agent:working', { description: claimLine(HOUR) }),
        node('COD-2', 'agent:working', { description: claimLine(600) })
      ]);
      expect(r.ticket).toBe('COD-2');
    });

    it('stale claim is a take over with age in hours', () => {
      const r = attended([
        node('COD-1', 'agent:working', {
          description: claimLine(3 * HOUR + 60)
        })
      ]);
      expect(r).toMatchObject({
        verdict: 'run',
        reason: 'take over',
        detail: 'claim 3 h old'
      });
    });

    it('exactly 2 h is stale', () => {
      expect(
        attended([
          node('COD-1', 'agent:working', { description: claimLine(2 * HOUR) })
        ]).verdict
      ).toBe('run');
    });

    it('missing claim counts as running, never a take over', () => {
      const r = attended([node('COD-1', 'agent:working')]);
      expect(r).toMatchObject({
        verdict: 'running',
        ticket: 'COD-1',
        detail: 'no claim line'
      });
    });

    it('running beats a stale take over', () => {
      const r = attended([
        node('COD-1', 'agent:working', { description: claimLine(5 * HOUR) }),
        node('COD-2', 'agent:working', { description: claimLine(60) })
      ]);
      expect(r.verdict).toBe('running');
      expect(r.ticket).toBe('COD-2');
    });
  });

  describe('closed tickets keep agent:working', () => {
    const view = (issues: Node[]) =>
      run(`queue_view(${NOW}; 5; {}; null; {})`, issues) as {
        next: Array<{ ticket: string; reason: string }>;
        held: { tickets: unknown[] };
        parked: Array<{ ticket: string }>;
      };

    it.each([
      ['Done', 'completed'],
      ['Canceled', 'canceled']
    ])('a %s ticket holds nothing', (_name, type) => {
      const v = view([
        node('COD-1', 'agent:working', {
          state: { type },
          description: claimLine(600)
        })
      ]);
      expect(v.next).toEqual([]);
      expect(v.held.tickets).toEqual([]);
      expect(v.parked).toEqual([]);
    });

    it.each([['completed'], ['canceled']])(
      'a %s ticket with a stale claim is no take over',
      (type) => {
        const r = attended([
          node('COD-1', 'agent:working', {
            state: { type },
            description: claimLine(3 * HOUR)
          })
        ]);
        expect(r.reason).not.toBe('take over');
        expect(r.verdict).toBe('idle');
      }
    );

    it('an answered ticket behind a Done one is run', () => {
      const answered = node('COD-3', 'agent:needs-input', {
        comments: {
          nodes: [
            { body: '**Agent: question**', createdAt: '2026-10-01T00:00:00Z' },
            { body: 'go ahead', createdAt: '2026-10-02T00:00:00Z' }
          ]
        }
      });
      const r = attended([
        node('COD-1', 'agent:working', {
          state: { type: 'completed' },
          description: claimLine(600)
        }),
        answered
      ]);
      expect(r).toMatchObject({
        verdict: 'run',
        ticket: 'COD-3',
        reason: 'answered'
      });
    });
  });

  describe('answered', () => {
    const input = (...bodies: string[]) =>
      node('COD-3', 'agent:needs-input', {
        comments: {
          nodes: bodies.map((body, i) => ({
            body,
            createdAt: `2026-10-0${i + 1}T00:00:00.000Z`
          }))
        }
      });

    it('human comment last is answered', () => {
      const r = attended([input('**Agent: question**', ' Yes, go ahead ')]);
      expect(r).toMatchObject({
        verdict: 'run',
        ticket: 'COD-3',
        reason: 'answered'
      });
    });

    it('agent comment last is not answered', () => {
      const r = attended([input('hello', '**Agent: question** ok?')]);
      expect(r.verdict).toBe('idle');
      expect(r.waiting).toEqual(['COD-3 input']);
    });

    it('no comments is not answered', () => {
      expect(attended([input()]).verdict).toBe('idle');
    });

    it('newest by createdAt, not array order', () => {
      const n = input();
      n.comments.nodes = [
        { body: 'answer', createdAt: '2026-10-05T00:00:00Z' },
        { body: '**Agent** q', createdAt: '2026-10-01T00:00:00Z' }
      ];
      expect(attended([n]).reason).toBe('answered');
    });
  });

  describe('review feedback', () => {
    const rev = (...comments: Array<{ body: string; createdAt: string }>) =>
      review('COD-4', { comments: { nodes: comments } });

    it('human comment after PR ready', () => {
      const r = attended([
        rev(prReady(false), {
          body: 'fix this',
          createdAt: '2026-09-02T00:00:00Z'
        })
      ]);
      expect(r).toMatchObject({
        verdict: 'run',
        ticket: 'COD-4',
        reason: 'review feedback'
      });
    });

    it('human comment before PR ready is not feedback', () => {
      const r = attended([
        rev(prReady(false, '2026-09-02T00:00:00Z'), {
          body: 'earlier',
          createdAt: '2026-09-01T00:00:00Z'
        })
      ]);
      expect(r.verdict).toBe('idle');
    });

    it('human comment answered by review addressed is not feedback', () => {
      const r = attended([
        rev(
          prReady(false),
          { body: 'fix this', createdAt: '2026-09-02T00:00:00Z' },
          {
            body: '**Agent: review addressed**',
            createdAt: '2026-09-03T00:00:00Z'
          }
        )
      ]);
      expect(r.verdict).toBe('idle');
    });

    it('human comment after review addressed', () => {
      const r = attended([
        rev(
          prReady(false),
          {
            body: '**Agent: review addressed**',
            createdAt: '2026-09-03T00:00:00Z'
          },
          { body: 'one more', createdAt: '2026-09-04T00:00:00Z' }
        )
      ]);
      expect(r.reason).toBe('review feedback');
    });

    it('agent comment after PR ready is not feedback', () => {
      const r = attended([
        rev(prReady(false), {
          body: '**Agent: note**',
          createdAt: '2026-09-02T00:00:00Z'
        })
      ]);
      expect(r.verdict).toBe('idle');
    });

    it('human comment without any PR ready is not feedback', () => {
      expect(
        attended([rev({ body: 'hi', createdAt: '2026-09-02T00:00:00.500Z' })])
          .verdict
      ).toBe('idle');
    });

    it('unresolved review threads from the watch', () => {
      const r = attended([rev(prReady(false))], 5, {
        'COD-4': { unresolved: 2 }
      });
      expect(r.reason).toBe('review feedback');
    });

    it.each([{ 'COD-4': { unresolved: 0 } }, { 'COD-4': {} }, {}])(
      'no unresolved in %j',
      (watch) => {
        expect(attended([rev(prReady(false))], 5, watch).verdict).toBe('idle');
      }
    );

    it('a completed review ticket is not feedback', () => {
      const r = attended(
        [review('COD-4', { state: { type: 'completed' } })],
        5,
        { 'COD-4': { unresolved: 1 } }
      );
      expect(r.verdict).toBe('idle');
    });

    it.each(['merged', 'closed'])(
      'a %s PR is no feedback, even with threads or a comment',
      (state) => {
        expect(
          attended([rev(prReady(true))], 5, {
            'COD-4': { state, unresolved: 2 }
          }).verdict
        ).toBe('idle');
      }
    );
  });

  describe('limit', () => {
    const done = (id: string, daysAgo: number) =>
      review(id, {
        state: { type: 'completed' },
        completedAt: iso(daysAgo * DAY),
        comments: { nodes: [prReady()] }
      });
    const used = (issues: Node[], limit = 5) =>
      run(`limit_used(${NOW}; ${limit})`, issues) as {
        used: number;
        open: string[];
        handoffs: string[];
      };

    it('lists hand-off tickets but does not count them', () => {
      const r = used([
        review('COD-1'),
        done('COD-2', 1),
        done('COD-3', 2),
        done('COD-4', 3),
        done('COD-5', 4)
      ]);
      expect(r).toEqual({
        used: 1,
        open: ['COD-1'],
        handoffs: ['COD-2', 'COD-3', 'COD-4', 'COD-5']
      });
    });

    it('counts open reviews fully', () => {
      expect(used([review('A'), review('B'), review('C')]).used).toBe(3);
    });

    it('ignores hand-offs completed over 14 days ago', () => {
      expect(used([done('A', 15)]).handoffs).toEqual([]);
      expect(used([done('A', 13)]).handoffs).toEqual(['A']);
      expect(used([done('A', 13)]).used).toBe(0);
    });

    it('ignores completed tickets without hand-offs', () => {
      const n = done('A', 1);
      n.comments.nodes = [prReady(false)];
      expect(used([n]).handoffs).toEqual([]);
    });

    it('ignores non-review tickets', () => {
      expect(used([ready('A'), node('B', 'agent:needs-input')]).used).toBe(0);
    });

    it('limit reached is idle even with a ready ticket', () => {
      const r = attended(
        [review('COD-1'), review('COD-2'), review('COD-3'), ready('COD-9')],
        3
      );
      expect(r).toMatchObject({ verdict: 'idle', used: 3, limit: 3 });
    });

    it('limit reached still yields to answered and feedback', () => {
      const r = attended(
        [
          review('COD-1'),
          review('COD-2'),
          review('COD-3'),
          node('COD-7', 'agent:needs-input', {
            comments: {
              nodes: [{ body: 'yes', createdAt: '2026-10-01T00:00:00Z' }]
            }
          })
        ],
        3
      );
      expect(r.reason).toBe('answered');
    });
  });

  describe('ready', () => {
    it('picks a ready ticket', () => {
      expect(attended([ready('COD-9')])).toMatchObject({
        verdict: 'run',
        ticket: 'COD-9',
        reason: 'ready'
      });
    });

    it('skips blocked, keeps unblocked or resolved blockers', () => {
      const rel = (type: string, state: string) => ({
        inverseRelations: {
          nodes: [{ type, issue: { state: { type: state } } }]
        }
      });
      expect(attended([ready('A', rel('blocks', 'started'))]).verdict).toBe(
        'idle'
      );
      expect(attended([ready('A', rel('blocks', 'completed'))]).ticket).toBe(
        'A'
      );
      expect(attended([ready('A', rel('blocks', 'canceled'))]).ticket).toBe(
        'A'
      );
      expect(attended([ready('A', rel('related', 'started'))]).ticket).toBe(
        'A'
      );
    });

    it.each(['nx-plugins', 'enjinex'])('skips other repo %s', (repo) => {
      const n = ready('A', {
        labels: { nodes: [{ name: 'agent:ready' }, { name: repo }] }
      });
      expect(attended([n]).verdict).toBe('idle');
    });

    it('skips completed ready tickets', () => {
      expect(
        attended([ready('A', { state: { type: 'completed' } })]).verdict
      ).toBe('idle');
    });

    it('other-repo working ticket is ignored', () => {
      const n = node('A', 'agent:working', {
        labels: { nodes: [{ name: 'agent:working' }, { name: 'enjinex' }] }
      });
      expect(attended([n]).verdict).toBe('idle');
    });
  });

  describe('queue_order', () => {
    const order = (issues: Node[]) =>
      (run('sort_by(queue_order) | map(.identifier)', issues) as string[]).join(
        ' '
      );
    const st = (type: string) => ({ state: { type } });

    it('status first', () => {
      expect(
        order([
          ready('T', st('triage')),
          ready('B', st('backlog')),
          ready('U', st('unstarted')),
          ready('S', st('started'))
        ])
      ).toBe('S U B T');
    });

    it('priority next, none last', () => {
      expect(
        order([
          ready('N', { priority: 0 }),
          ready('L', { priority: 4 }),
          ready('U', { priority: 1 }),
          ready('M', { priority: 3 })
        ])
      ).toBe('U M L N');
    });

    it('oldest first last', () => {
      expect(
        order([
          ready('new', { createdAt: '2026-05-01T00:00:00.000Z' }),
          ready('old', { createdAt: '2026-02-01T00:00:00.000Z' })
        ])
      ).toBe('old new');
    });

    it('status beats priority', () => {
      expect(
        order([
          ready('hi', { priority: 1, ...st('backlog') }),
          ready('lo', { priority: 4, ...st('started') })
        ])
      ).toBe('lo hi');
    });

    it('attended takes the first in order', () => {
      expect(
        attended([
          ready('A', { priority: 3 }),
          ready('B', { priority: 1 }),
          ready('C', { priority: 0 })
        ]).ticket
      ).toBe('B');
    });
  });

  describe('attended_line', () => {
    const waitingTicket = (id: string) =>
      node(id, 'agent:needs-input', {
        comments: {
          nodes: [{ body: '**Agent** q', createdAt: '2026-10-01T00:00:00Z' }]
        }
      });
    const handoffTicket = (id: string) =>
      review(id, {
        state: { type: 'completed' },
        completedAt: iso(DAY),
        comments: { nodes: [prReady()] }
      });

    it('running with and without detail', () => {
      expect(
        line([node('COD-545', 'agent:working', { description: claimLine(60) })])
      ).toBe('running: COD-545 · step 2');
      expect(
        line([
          node('COD-545', 'agent:working', {
            description: `**Claim:** s · p · ${iso(60).slice(0, 16)}Z`
          })
        ])
      ).toBe('running: COD-545');
    });

    it('run wordings', () => {
      expect(
        line([
          node('COD-543', 'agent:needs-input', {
            comments: {
              nodes: [{ body: 'ok', createdAt: '2026-10-01T00:00:00Z' }]
            }
          })
        ])
      ).toBe('run now: COD-543 answered');
      expect(
        line([review('COD-544')], 5, { 'COD-544': { unresolved: 1 } })
      ).toBe('run now: COD-544 review feedback');
      expect(line([ready('COD-546')])).toBe('run now: COD-546 ready');
      expect(
        line([
          node('COD-540', 'agent:working', { description: claimLine(3 * HOUR) })
        ])
      ).toBe('run now: take over COD-540 (claim 3 h old)');
      expect(line([node('COD-540', 'agent:working')])).toBe(
        'running: COD-540 · no claim line'
      );
    });

    it('idle lists what waits, in order', () => {
      expect(
        line([handoffTicket('COD-3'), review('COD-2'), waitingTicket('COD-1')])
      ).toBe(
        'idle: waits on COD-1 input, COD-2 PR, COD-3 hand-offs; limit 1/5'
      );
    });

    it('idle with nothing waiting', () => {
      expect(line([])).toBe('idle: nothing waiting; limit 0/5');
    });

    it('idle because the limit is reached keeps the wording', () => {
      expect(
        line(
          [review('COD-1'), review('COD-2'), review('COD-3'), ready('COD-9')],
          3
        )
      ).toBe('idle: waits on COD-1 PR, COD-2 PR, COD-3 PR; limit 3/3');
    });
  });

  describe('parked', () => {
    const since = (ago: number) => iso(ago).slice(0, 16) + 'Z';
    const HEAD = 'abc1234def';
    const marker = (wait: string, ago: number, pr = 12) =>
      `**Next:** Waiting: ${wait} · PR #${pr}${wait.toLowerCase() === 'ci' ? ' @ abc1234' : ''} · since ${since(ago)}`;
    const parkedNode = (
      id: string,
      label: string,
      wait: string,
      ago: number,
      over: Record<string, unknown> = {}
    ) =>
      node(id, label, {
        description: `Status\n\n${marker(wait, ago)}\n`,
        ...over
      });
    const claimed = (wait: string, ago: number, claimAgo = 60) =>
      `${claimLine(claimAgo).replace(/\*\*Next:\*\*.*\n/, '')}${marker(wait, ago)}\n`;
    const parkedOf = (n: Node) => run('parked', n);
    const state = (n: Node, waits: Record<string, unknown> = {}) =>
      run(`wait_state(${NOW}; ${JSON.stringify(waits)})`, n);
    type Item = { ticket: string; reason: string; detail: string | null };
    type View = {
      limit: { used: number; max: number };
      next: Item[];
      held: { tickets: string[]; free: Array<Record<string, unknown>> };
      parked: Array<Record<string, unknown>>;
    };
    const view = (
      issues: Node[],
      waits: Record<string, unknown> = {},
      limit = 5,
      watch: Record<string, unknown> = {}
    ) =>
      run(
        `queue_view(${NOW}; ${limit}; ${JSON.stringify(watch)}; null; ${JSON.stringify(waits)})`,
        issues
      ) as View;
    const pick = (issues: Node[], waits: Record<string, unknown> = {}) =>
      run(`attended(${NOW}; 5; {}; ${JSON.stringify(waits)})`, issues) as {
        verdict: string;
        ticket: string | null;
        reason: string | null;
      };

    describe('marker', () => {
      const withNext = (next: string | null) =>
        node('COD-1', 'agent:working', {
          description: next === null ? null : `x\n${next}\n`
        });

      it.each([
        [
          'copilot',
          '**Next:** Waiting: copilot · PR #123 · since 2026-10-11T16:20Z',
          { wait: 'copilot', pr: 123, sha: null, since: 1791735600 }
        ],
        [
          'CI',
          '**Next:** Waiting: CI · PR #7 · since 2026-10-11T16:20Z',
          { wait: 'ci', pr: 7, sha: null, since: 1791735600 }
        ],
        [
          'lowercase ci',
          '**Next:** Waiting: ci · PR #7 · since 2026-10-11T16:20Z',
          { wait: 'ci', pr: 7, sha: null, since: 1791735600 }
        ],
        [
          'Copilot',
          '**Next:** Waiting: Copilot · PR #7 · since 2026-10-11T16:20Z',
          { wait: 'copilot', pr: 7, sha: null, since: 1791735600 }
        ],
        [
          'a PR Linear turned into a link',
          '**Next:** Waiting: copilot · PR [codeware-sthlm/cdwr#606](https://linear.app/codeware/review/x-1) · since 2026-10-11T16:20Z',
          { wait: 'copilot', pr: 606, sha: null, since: 1791735600 }
        ],
        [
          'a linked PR on a commit',
          '**Next:** Waiting: CI · PR [codeware-sthlm/cdwr#606](https://linear.app/codeware/review/x-1) @ abc1234 · since 2026-10-11T16:20Z',
          { wait: 'ci', pr: 606, sha: 'abc1234', since: 1791735600 }
        ],
        [
          'a code span with a bare number',
          '**Next:** `Waiting: CI · PR 607 @ 4535094 · since 2026-10-11T16:20Z`',
          { wait: 'ci', pr: 607, sha: '4535094', since: 1791735600 }
        ],
        [
          'CI on a commit',
          '**Next:** Waiting: CI · PR #7 @ abc1234 · since 2026-10-11T16:20Z',
          { wait: 'ci', pr: 7, sha: 'abc1234', since: 1791735600 }
        ]
      ])('parses %s', (_name, next, expected) => {
        expect(parkedOf(withNext(next))).toEqual(expected);
      });

      it.each([
        ['an ordinary next line', '**Next:** step 2'],
        [
          'an unknown wait',
          '**Next:** Waiting: review · PR #7 · since 2026-10-11T16:20Z'
        ],
        ['no pr', '**Next:** Waiting: ci · since 2026-10-11T16:20Z'],
        [
          'a PR link titled with its name',
          '**Next:** Waiting: CI · PR [feat: x](https://linear.app/codeware/review/x-1) @ abc1234 · since 2026-10-11T16:20Z'
        ],
        ['a bad time', '**Next:** Waiting: ci · PR #7 · since yesterday'],
        [
          'a wrong separator',
          '**Next:** Waiting: ci - PR #7 - since 2026-10-11T16:20Z'
        ],
        [
          'trailing text',
          '**Next:** Waiting: ci · PR #7 · since 2026-10-11T16:20Z soon'
        ]
      ])('is null for %s', (_name, next) => {
        expect(parkedOf(withNext(next))).toBeNull();
      });

      it('is null without a description', () => {
        expect(parkedOf(withNext(null))).toBeNull();
      });
    });

    describe('wait_state', () => {
      const copilot = (ago: number) =>
        parkedNode('COD-1', 'agent:working', 'copilot', ago);
      const ci = parkedNode('COD-1', 'agent:working', 'CI', 60);

      it.each([
        [
          'reviewed inside the window',
          60,
          { reviewed: true },
          true,
          'reviewed'
        ],
        [
          'reviewed after the window',
          3000,
          { reviewed: true },
          true,
          'reviewed'
        ],
        [
          '20 minutes without a review',
          1200,
          { reviewed: false },
          true,
          'no review'
        ],
        ['20 minutes with no entry', 4000, undefined, true, 'no review'],
        ['pending inside the window', 1140, { reviewed: false }, false, null],
        ['pending with no entry', 60, undefined, false, null]
      ])('copilot: %s', (_name, ago, entry, resolved, outcome) => {
        const waits = entry ? { 'COD-1': entry } : {};
        expect(state(copilot(ago), waits)).toEqual({ resolved, outcome });
      });

      it.each([
        ['SUCCESS', true, 'success'],
        ['FAILURE', true, 'failure'],
        ['ERROR', true, 'failure'],
        ['PENDING', false, null],
        ['EXPECTED', false, null],
        [null, false, null]
      ])('ci: rollup %s', (rollup, resolved, outcome) => {
        expect(
          state(ci, { 'COD-1': { reviewed: false, rollup, oid: HEAD } })
        ).toEqual({
          resolved,
          outcome
        });
      });

      it('ci: a marker without a commit waits for the timeout', () => {
        const bare = node('COD-1', 'agent:working', {
          description: `x\n**Next:** Waiting: CI · PR #12 · since ${since(60)}\n`
        });
        const waits = { 'COD-1': { rollup: 'SUCCESS', oid: HEAD } };
        expect(state(bare, waits)).toEqual({ resolved: false, outcome: null });
      });

      it('ci: missing entry is pending', () => {
        expect(state(ci)).toEqual({ resolved: false, outcome: null });
      });

      describe('ci on a named commit', () => {
        const onSha = (ago: number) =>
          node('COD-1', 'agent:working', {
            description: `x\n**Next:** Waiting: CI · PR #12 @ abc1234 · since ${since(ago)}\n`
          });

        it.each([
          ['the pushed head', 'abc1234def', 'SUCCESS', true, 'success'],
          ['the pushed head failing', 'abc1234def', 'FAILURE', true, 'failure'],
          ['the commit before it', 'fff0000aaa', 'SUCCESS', false, null],
          ['no head yet', null, 'SUCCESS', false, null]
        ])('%s', (_name, oid, rollup, resolved, outcome) => {
          expect(
            state(onSha(60), { 'COD-1': { reviewed: false, rollup, oid } })
          ).toEqual({ resolved, outcome });
        });

        it('times out after an hour on the commit before it', () => {
          expect(
            state(onSha(3600), {
              'COD-1': { reviewed: false, rollup: 'SUCCESS', oid: 'fff0000' }
            })
          ).toEqual({ resolved: true, outcome: 'timeout' });
        });
      });

      it.each([
        ['no checks', null],
        ['a check that never starts', 'EXPECTED']
      ])('ci: %s times out after an hour', (_name, rollup) => {
        const late = parkedNode('COD-1', 'agent:working', 'CI', 3600);
        expect(state(late, { 'COD-1': { reviewed: false, rollup } })).toEqual({
          resolved: true,
          outcome: 'timeout'
        });
      });
    });

    describe('queue_view', () => {
      const CI = { 'COD-1': { reviewed: false, rollup: 'SUCCESS', oid: HEAD } };

      it('puts resolved waits first, oldest first, as run with its reason', () => {
        const issues = [
          ready('COD-9'),
          node('COD-5', 'agent:working', { description: claimLine(HOUR) }),
          parkedNode('COD-1', 'agent:working', 'ci', 600, {
            description: claimed('ci', 600, 60)
          }),
          parkedNode('COD-2', 'agent:review', 'ci', 1800)
        ];
        const waits = {
          'COD-1': { rollup: 'SUCCESS', oid: HEAD },
          'COD-2': { rollup: 'FAILURE', oid: HEAD }
        };
        const r = view(issues, waits);
        expect(r.next).toEqual([
          {
            ticket: 'COD-2',
            reason: 'parked wait resolved',
            detail: 'failure'
          },
          {
            ticket: 'COD-1',
            reason: 'parked wait resolved',
            detail: 'success'
          },
          { ticket: 'COD-5', reason: 'resume', detail: 'step 2' },
          { ticket: 'COD-9', reason: 'ready', detail: null }
        ]);
        expect(pick(issues, waits)).toMatchObject({
          verdict: 'run',
          ticket: 'COD-2',
          reason: 'parked wait resolved'
        });
        expect(
          line(issues.slice(0, 1).concat(issues.slice(2, 3)), 5, {})
        ).toBeTypeOf('string');
      });

      it('reads the pick as a run line', () => {
        const issues = [parkedNode('COD-1', 'agent:working', 'ci', 60)];
        expect(
          run(
            `attended(${NOW}; 5; {}; ${JSON.stringify(CI)}) | attended_line`,
            issues
          )
        ).toBe('run now: COD-1 parked wait resolved (success)');
      });

      it('keeps a pending parked working ticket out of next and not running', () => {
        const issues = [
          parkedNode('COD-1', 'agent:working', 'ci', 600, {
            description: claimed('ci', 600, 60)
          })
        ];
        expect(view(issues).next).toEqual([]);
        expect(pick(issues)).toMatchObject({ verdict: 'idle', ticket: null });
      });

      it('keeps a parked working ticket without a claim out of resume', () => {
        const issues = [parkedNode('COD-1', 'agent:working', 'ci', 60)];
        expect(view(issues).next).toEqual([]);
      });

      it('takes over a stale parked ticket once, resolved or not', () => {
        const stale = (id: string) =>
          parkedNode(id, 'agent:working', 'ci', 5 * HOUR, {
            description: claimed('ci', 5 * HOUR, 5 * HOUR)
          });
        const issues = [stale('COD-1'), stale('COD-2')];
        const r = view(issues, { 'COD-1': { rollup: 'SUCCESS', oid: HEAD } });
        expect(r.next).toEqual([
          { ticket: 'COD-1', reason: 'take over', detail: 'claim 5 h old' },
          { ticket: 'COD-2', reason: 'take over', detail: 'claim 5 h old' }
        ]);
      });

      it('does not treat a parked review ticket as review feedback', () => {
        const issues = [parkedNode('COD-1', 'agent:review', 'copilot', 60)];
        const watch = { 'COD-1': { unresolved: 2 } };
        expect(view(issues, {}, 5, watch).next).toEqual([]);
        expect(
          view(issues, { 'COD-1': { reviewed: true } }, 5, watch).next
        ).toEqual([
          {
            ticket: 'COD-1',
            reason: 'parked wait resolved',
            detail: 'reviewed'
          }
        ]);
      });

      it('counts parked working tickets in the limit, parked reviews once', () => {
        const issues = [
          parkedNode('COD-1', 'agent:working', 'ci', 60, {
            description: claimed('ci', 60, 60)
          }),
          parkedNode('COD-2', 'agent:review', 'copilot', 60),
          review('COD-3'),
          ready('COD-9')
        ];
        const r = view(issues, {}, 3, { 'COD-3': { pr: 5 } });
        expect(r.limit).toEqual({ used: 3, max: 3 });
        expect(r.next).toEqual([]);
        expect(r.held.tickets).toEqual(['COD-9']);
        expect(r.held.free).toEqual([
          { action: 'review', ticket: 'COD-2', pr: null },
          { action: 'review', ticket: 'COD-3', pr: 5 },
          { action: 'wait', ticket: 'COD-1', pr: 12 },
          { action: 'limit', value: 4 }
        ]);
      });

      it('ignores parked tickets that are closed or of another label', () => {
        const issues = [
          parkedNode('COD-1', 'agent:review', 'ci', 60, {
            state: { type: 'completed' }
          }),
          parkedNode('COD-2', 'agent:needs-input', 'ci', 60)
        ];
        const r = view(issues, CI);
        expect(r.parked).toEqual([]);
        expect(r.limit.used).toBe(0);
      });

      it('lists parked, oldest first', () => {
        const r = view(
          [
            parkedNode('COD-2', 'agent:review', 'copilot', 300),
            parkedNode('COD-1', 'agent:working', 'ci', 900)
          ],
          {
            'COD-1': { rollup: 'PENDING', oid: HEAD },
            'COD-2': { reviewed: true }
          }
        );
        expect(r.parked).toEqual([
          {
            ticket: 'COD-1',
            wait: 'ci',
            pr: 12,
            since: '2026-10-11T11:45:00Z',
            resolved: false,
            outcome: null
          },
          {
            ticket: 'COD-2',
            wait: 'copilot',
            pr: 12,
            since: '2026-10-11T11:55:00Z',
            resolved: true,
            outcome: 'reviewed'
          }
        ]);
      });

      it('keeps the older arities working', () => {
        const issues = [review('COD-1')];
        expect(run(`queue_view(${NOW}; 5; {}; null)`, issues)).toMatchObject({
          limit: { used: 1, max: 5 },
          parked: []
        });
        expect(run(`attended(${NOW}; 5; {})`, issues)).toMatchObject({
          verdict: 'idle',
          used: 1
        });
      });
    });
  });

  describe('queue_view', () => {
    type Item = { ticket: string; reason: string; detail: string | null };
    type View = {
      at: string;
      limit: { used: number; max: number };
      session: unknown;
      next: Item[];
      held: {
        tickets: string[];
        free: Array<Record<string, unknown>>;
      };
      table: {
        before: Array<{ ticket: string; kind: string }>;
        after: Array<Record<string, unknown>>;
        label: Array<{ ticket: string; parent: string; blockers: string[] }>;
      };
    };
    const view = (
      issues: Node[],
      limit = 5,
      watch: Record<string, unknown> = {},
      session: unknown = null
    ) =>
      run(
        `queue_view(${NOW}; ${limit}; ${JSON.stringify(watch)}; ${JSON.stringify(session)})`,
        issues
      ) as View;
    const human = [{ body: 'yes', createdAt: '2026-10-01T00:00:00Z' }];
    const agent = (body: string) => [
      { body, createdAt: '2026-10-01T00:00:00Z' }
    ];
    const needsInput = (id: string, comments: typeof human) =>
      node(id, 'agent:needs-input', { comments: { nodes: comments } });
    const done = (id: string) =>
      review(id, {
        state: { type: 'completed' },
        completedAt: iso(DAY),
        comments: { nodes: [prReady()] }
      });

    it('carries at, limit and session', () => {
      const session = { state: 'alive', detail: 'working', id: 's1' };
      const r = view([review('COD-1'), review('COD-2')], 4, {}, session);
      expect(r.at).toBe('2026-10-11T12:00:00Z');
      expect(r.limit).toEqual({ used: 2, max: 4 });
      expect(r.session).toEqual(session);
      expect(view([]).session).toBeNull();
    });

    it('orders next by what the skill takes first', () => {
      const r = view(
        [
          ready('COD-16'),
          review('COD-15'),
          needsInput('COD-14', human),
          node('COD-13', 'agent:working', { description: claimLine(5 * HOUR) }),
          node('COD-12', 'agent:working'),
          node('COD-10', 'agent:working', { description: claimLine(HOUR) }),
          node('COD-11', 'agent:working', {
            description: claimLine(HOUR / 2).replace('step 2', 'step 3')
          })
        ],
        5,
        { 'COD-15': { unresolved: 1 } }
      );
      expect(r.next).toEqual([
        { ticket: 'COD-11', reason: 'resume', detail: 'step 3' },
        { ticket: 'COD-10', reason: 'resume', detail: 'step 2' },
        { ticket: 'COD-12', reason: 'resume', detail: 'no claim line' },
        { ticket: 'COD-13', reason: 'take over', detail: 'claim 5 h old' },
        { ticket: 'COD-14', reason: 'answered', detail: null },
        { ticket: 'COD-15', reason: 'review feedback', detail: null },
        { ticket: 'COD-16', reason: 'ready', detail: null }
      ]);
    });

    it('holds ready tickets when the limit is full', () => {
      const r = view(
        [review('COD-1'), review('COD-2'), ready('COD-9'), ready('COD-8')],
        2,
        { 'COD-1': { pr: 5 } }
      );
      expect(r.next).toEqual([]);
      expect(r.held.tickets).toEqual(['COD-9', 'COD-8']);
      expect(r.held.free).toEqual([
        { action: 'review', ticket: 'COD-1', pr: 5 },
        { action: 'review', ticket: 'COD-2', pr: null },
        { action: 'limit', value: 3 }
      ]);
    });

    it('holds nothing when the limit is not full', () => {
      const r = view([review('COD-1'), ready('COD-9')], 2);
      expect(r.next.map((n) => n.ticket)).toEqual(['COD-9']);
      expect(r.held).toEqual({ tickets: [], free: [] });
    });

    it('frees nothing when the limit is full without a ready ticket', () => {
      const r = view([review('COD-1'), review('COD-2')], 2);
      expect(r.held).toEqual({ tickets: [], free: [] });
    });

    it('lists unanswered input as plan or question, not answered ones', () => {
      const r = view([
        needsInput('COD-1', agent('**Agent: plan ready**\n\nPlan')),
        needsInput('COD-2', agent('**Agent: question**\n\nWhich?')),
        needsInput('COD-3', human)
      ]);
      expect(r.table.before).toEqual([
        { ticket: 'COD-1', kind: 'plan' },
        { ticket: 'COD-2', kind: 'question' }
      ]);
    });

    it('lists open reviews, then hand-off tickets with unticked items', () => {
      const r = view([done('COD-3'), review('COD-2')], 5, {
        'COD-2': { pr: 7 }
      });
      expect(r.table.after).toEqual([
        { ticket: 'COD-2', kind: 'pr', pr: 7 },
        { ticket: 'COD-3', kind: 'handoffs', items: ['check'] }
      ]);
    });

    it('ignores tickets of other repos', () => {
      const other = (label: string, repo: string, over = {}) =>
        node('COD-1', label, {
          labels: { nodes: [{ name: label }, { name: repo }] },
          ...over
        });
      const r = view([
        other('agent:ready', 'nx-plugins'),
        other('agent:review', 'enjinex'),
        other('agent:needs-input', 'enjinex', {
          comments: { nodes: human }
        })
      ]);
      expect(r.next).toEqual([]);
      expect(r.limit.used).toBe(0);
      expect(r.table).toEqual({ before: [], after: [], label: [] });
    });

    describe('to label', () => {
      const blocker = (
        id: string,
        type: string,
        labelName: string | null = 'agent:review'
      ) => ({
        type: 'blocks',
        issue: {
          identifier: id,
          state: { type },
          labels: { nodes: labelName ? [{ name: labelName }] : [] }
        }
      });
      const sub = (id: string, relations: unknown[], over = {}) =>
        node(id, null, {
          parent: { identifier: 'COD-100' },
          inverseRelations: { nodes: relations },
          ...over
        });
      const listed = (issues: Node[]) =>
        view(issues).table.label.map((l) => l.ticket);

      it('lists a sub-issue whose blockers are all done', () => {
        const r = view([
          sub('COD-5', [
            blocker('COD-1', 'completed'),
            blocker('COD-2', 'completed', null)
          ])
        ]);
        expect(r.table.label).toEqual([
          { ticket: 'COD-5', parent: 'COD-100', blockers: ['COD-1', 'COD-2'] }
        ]);
      });

      it('sorts by queue order', () => {
        const rel = [blocker('COD-1', 'completed')];
        expect(
          listed([
            sub('COD-6', rel, { priority: 3 }),
            sub('COD-5', rel, { priority: 1 })
          ])
        ).toEqual(['COD-5', 'COD-6']);
      });

      it.each([
        [
          'a blocker is still open',
          sub('COD-5', [
            blocker('COD-1', 'completed'),
            blocker('COD-2', 'started')
          ])
        ],
        ['there are no blockers', sub('COD-5', [])],
        [
          'it only has relations of another type',
          sub('COD-5', [
            { type: 'related', issue: { state: { type: 'completed' } } }
          ])
        ],
        [
          'it already has an agent label',
          sub('COD-5', [blocker('COD-1', 'completed')], {
            labels: { nodes: [{ name: 'agent:ready' }] }
          })
        ],
        [
          'it is started',
          sub('COD-5', [blocker('COD-1', 'completed')], {
            state: { type: 'started' }
          })
        ],
        [
          'no blocker carries an agent label',
          sub('COD-5', [blocker('COD-1', 'completed', null)])
        ],
        [
          'it belongs to another repo',
          sub('COD-5', [blocker('COD-1', 'completed')], {
            labels: { nodes: [{ name: 'nx-plugins' }] }
          })
        ],
        [
          'it has no parent',
          sub('COD-5', [blocker('COD-1', 'completed')], { parent: null })
        ],
        [
          'its relations run past one page',
          sub('COD-5', [blocker('COD-1', 'completed')], {
            inverseRelations: {
              nodes: [blocker('COD-1', 'completed')],
              pageInfo: { hasNextPage: true }
            }
          })
        ],
        [
          'its parent was cancelled, an abandoned split',
          sub('COD-5', [blocker('COD-1', 'completed')], {
            parent: { identifier: 'COD-100', state: { type: 'canceled' } }
          })
        ]
      ])('does not list when %s', (_name, issue) => {
        expect(listed([issue])).toEqual([]);
      });

      it('counts a cancelled blocker as done', () => {
        expect(
          listed([
            sub('COD-5', [
              blocker('COD-1', 'completed', null),
              blocker('COD-2', 'canceled')
            ])
          ])
        ).toEqual(['COD-5']);
      });

      it('lists attended.waiting entries after the others', () => {
        const r = attended([
          review('COD-1'),
          sub('COD-5', [blocker('COD-2', 'completed')])
        ]);
        expect(r.waiting).toEqual(['COD-1 PR', 'COD-5 label']);
      });

      it('leaves next, held and the limit alone', () => {
        const base = [review('COD-1'), ready('COD-9')];
        const extra = [...base, sub('COD-5', [blocker('COD-2', 'completed')])];
        const a = view(base, 2);
        const b = view(extra, 2);
        expect(b.next).toEqual(a.next);
        expect(b.held).toEqual(a.held);
        expect(b.limit).toEqual(a.limit);
        expect(b.table.label).toHaveLength(1);
        expect(attended(extra).verdict).toBe(attended(base).verdict);
        expect(attended(extra).used).toBe(attended(base).used);
      });
    });
  });
});

describe('session_state and session_prefix', () => {
  const NOW = 1_800_000_000;
  const iso = (agoSeconds: number) =>
    new Date((NOW - agoSeconds) * 1000).toISOString();
  const sess = (over: Record<string, unknown> = {}) => ({
    id: 's1',
    state: 'working',
    detail: null,
    lastSeen: iso(60),
    pidAlive: true,
    watcherAlive: false,
    ...over
  });
  const state = (sessions: unknown[]) => run(`session_state(${NOW})`, sessions);

  it.each([
    [
      'empty',
      [],
      { state: 'none', detail: null, id: null, ticket: null, lastSeen: null }
    ],
    [
      'alive working',
      [sess()],
      {
        state: 'alive',
        detail: 'working',
        id: 's1',
        ticket: null,
        lastSeen: iso(60)
      }
    ],
    [
      'alive polling with an old heartbeat',
      [sess({ lastSeen: iso(7200), watcherAlive: true })],
      {
        state: 'alive',
        detail: 'polling',
        id: 's1',
        ticket: null,
        lastSeen: iso(7200)
      }
    ],
    [
      'waiting for a permission prompt',
      [sess({ state: 'waiting', detail: 'permission_prompt' })],
      {
        state: 'waiting',
        detail: 'permission_prompt',
        id: 's1',
        ticket: null,
        lastSeen: iso(60)
      }
    ],
    [
      'stopped: process up, old heartbeat, no watcher',
      [sess({ state: 'stopped', lastSeen: iso(7200) })],
      { state: 'stopped', detail: null, id: null, ticket: null, lastSeen: null }
    ],
    [
      'ended is none',
      [sess({ state: 'ended' })],
      { state: 'none', detail: null, id: null, ticket: null, lastSeen: null }
    ],
    [
      'dead pid is none',
      [sess({ pidAlive: false })],
      { state: 'none', detail: null, id: null, ticket: null, lastSeen: null }
    ],
    [
      'waiting: a prompt open for an hour is still a live session',
      [
        sess({
          state: 'waiting',
          detail: 'permission_prompt',
          lastSeen: iso(3600)
        })
      ],
      {
        state: 'waiting',
        detail: 'permission_prompt',
        id: 's1',
        ticket: null,
        lastSeen: iso(3600)
      }
    ],
    [
      'stopped: a turn that just ended without a watcher wakes no one',
      [sess({ state: 'stopped', lastSeen: iso(30) })],
      { state: 'stopped', detail: null, id: null, ticket: null, lastSeen: null }
    ],
    [
      'the newest alive session wins',
      [
        sess({ id: 'old', lastSeen: iso(600) }),
        sess({ id: 'new', lastSeen: iso(30) })
      ],
      {
        state: 'alive',
        detail: 'working',
        id: 'new',
        ticket: null,
        lastSeen: iso(30)
      }
    ],
    [
      'a mirrored session with a fresh heartbeat is alive',
      [sess({ pidAlive: null, watcherAlive: null, lastSeen: iso(300) })],
      {
        state: 'alive',
        detail: 'working',
        id: 's1',
        ticket: null,
        lastSeen: iso(300)
      }
    ],
    [
      'a mirrored working session with a stale heartbeat is none',
      [sess({ pidAlive: null, watcherAlive: null, lastSeen: iso(1200) })],
      { state: 'none', detail: null, id: null, ticket: null, lastSeen: null }
    ],
    [
      'a mirrored session waiting at a prompt stays alive for three hours',
      [
        sess({
          pidAlive: null,
          watcherAlive: null,
          state: 'waiting',
          detail: 'permission_prompt',
          lastSeen: iso(7200)
        })
      ],
      {
        state: 'waiting',
        detail: 'permission_prompt',
        id: 's1',
        ticket: null,
        lastSeen: iso(7200)
      }
    ],
    [
      'a mirrored session waiting at a prompt for over three hours is none',
      [
        sess({
          pidAlive: null,
          watcherAlive: null,
          state: 'waiting',
          detail: 'permission_prompt',
          lastSeen: iso(10900)
        })
      ],
      { state: 'none', detail: null, id: null, ticket: null, lastSeen: null }
    ],
    [
      'a mirrored polling session that has not re-mirrored for three hours is none',
      [
        sess({
          pidAlive: null,
          watcherAlive: null,
          state: 'polling',
          lastSeen: iso(10900)
        })
      ],
      { state: 'none', detail: null, id: null, ticket: null, lastSeen: null }
    ],
    [
      'a mirrored polling session stays alive for three hours',
      [
        sess({
          pidAlive: null,
          watcherAlive: null,
          state: 'polling',
          lastSeen: iso(7200)
        })
      ],
      {
        state: 'alive',
        detail: 'polling',
        id: 's1',
        ticket: null,
        lastSeen: iso(7200)
      }
    ],
    [
      'a mirrored session that ended is none',
      [sess({ pidAlive: null, watcherAlive: null, state: 'ended' })],
      { state: 'none', detail: null, id: null, ticket: null, lastSeen: null }
    ],
    [
      'a mirrored stopped session is never alive',
      [sess({ pidAlive: null, watcherAlive: null, state: 'stopped' })],
      { state: 'none', detail: null, id: null, ticket: null, lastSeen: null }
    ],
    [
      'the ticket is passed through',
      [sess({ ticket: 'COD-556' })],
      {
        state: 'alive',
        detail: 'working',
        id: 's1',
        ticket: 'COD-556',
        lastSeen: iso(60)
      }
    ]
  ])('session_state: %s', (_name, sessions, expected) => {
    expect(state(sessions)).toEqual(expected);
  });

  it.each([
    [{ state: 'alive', detail: 'polling', id: 's' }, 'session polling'],
    [{ state: 'alive', detail: 'working', id: 's' }, 'session working'],
    [
      { state: 'waiting', detail: 'permission_prompt', id: 's' },
      'session waiting (permission_prompt)'
    ],
    [
      {
        state: 'stopped',
        detail: null,
        id: null,
        ticket: null,
        lastSeen: null
      },
      'session stopped'
    ],
    [
      { state: 'none', detail: null, id: null, ticket: null, lastSeen: null },
      'no session'
    ]
  ])('session_prefix: %j', (input, expected) => {
    expect(run('session_prefix', input)).toBe(expected);
  });
});

describe('launch', () => {
  const pick = (over: Record<string, unknown> = {}) => ({
    verdict: 'run',
    ticket: 'COD-1',
    reason: 'answered',
    ...over
  });
  const guards = (over: Record<string, unknown> = {}) => ({
    session: null,
    locked: false,
    spent: 0,
    cap: 40,
    last: null,
    ...over
  });
  const launch = (p: unknown, g: unknown) =>
    run(`launch(${JSON.stringify(g)})`, p) as {
      key: string | null;
      last: { key: string | null; launches: number };
      action: string;
      reason: string | null;
    };

  it.each([
    ['answered', 'answered', null],
    ['review feedback', 'review feedback', null],
    ['take over', 'take over', null],
    ['answered, session state none', 'answered', { state: 'none' }],
    ['answered, session state stopped', 'answered', { state: 'stopped' }]
  ])('launches: %s', (_name, reason, session) => {
    const res = launch(pick({ reason }), guards({ session }));
    expect(res).toEqual({
      key: `COD-1 ${reason}`,
      last: { key: `COD-1 ${reason}`, launches: 1 },
      action: 'launch',
      reason: null
    });
  });

  it.each([
    ['verdict running', pick({ verdict: 'running' }), 'COD-1 answered'],
    [
      'verdict idle without a ticket',
      pick({ verdict: 'idle', ticket: null, reason: null }),
      null
    ],
    ['reason ready', pick({ reason: 'ready' }), 'COD-1 ready']
  ])('skips, nothing to implement: %s', (_name, p, key) => {
    const res = launch(p, guards());
    expect(res.action).toBe('skip');
    expect(res.reason).toBe('nothing to implement');
    expect(res.key).toBe(key);
  });

  it.each(['alive', 'waiting'])('skips when a session is %s', (state) => {
    const res = launch(pick(), guards({ session: { state } }));
    expect(res.action).toBe('skip');
    expect(res.reason).toBe('a session is alive');
  });

  it('skips while a launched session is still running', () => {
    const res = launch(pick(), guards({ locked: true }));
    expect(res.action).toBe('skip');
    expect(res.reason).toBe('a launched session is still running');
  });

  it.each([
    ['equal to the cap', 40],
    ['above the cap', 52]
  ])('notifies when spend is %s', (_name, spent) => {
    const res = launch(pick(), guards({ spent }));
    expect(res.action).toBe('notify');
    expect(res.reason).toBe(`daily implement cap reached ($${spent} of $40)`);
  });

  describe('back-off', () => {
    it.each([
      [{ key: 'COD-1 answered', launches: 1 }, 'launch', 2],
      [{ key: 'COD-9 answered', launches: 5 }, 'launch', 1]
    ])('last %j gives %s', (last, action, launches) => {
      const res = launch(pick(), guards({ last }));
      expect(res.action).toBe(action);
      expect(res.last).toEqual({ key: 'COD-1 answered', launches });
    });

    it('counts a take-over after a dead session as the same ticket', () => {
      const res = launch(
        pick({ reason: 'take over' }),
        guards({ last: { key: 'COD-1 answered', launches: 2 } })
      );
      expect(res.action).toBe('notify');
    });

    it('starts fresh for new work on the same ticket', () => {
      const res = launch(
        pick({ reason: 'review feedback' }),
        guards({ last: { key: 'COD-1 answered', launches: 2 } })
      );
      expect(res.action).toBe('launch');
      expect(res.last).toEqual({ key: 'COD-1 review feedback', launches: 1 });
    });

    // Only a launch carries state to store
    it('two misses on one key notify and carry no state', () => {
      const res = launch(
        pick(),
        guards({ last: { key: 'COD-1 answered', launches: 2 } })
      );
      expect(res).toMatchObject({
        action: 'notify',
        reason: '2 launches changed nothing'
      });
      expect(res.last).toBeUndefined();
    });
  });

  it('a missing cap notifies instead of launching', () => {
    const res = launch(pick(), guards({ cap: null }));
    expect(res).toMatchObject({
      action: 'notify',
      reason: 'no daily implement cap set'
    });
  });

  describe('precedence', () => {
    it('a live session wins over the cap', () => {
      const res = launch(
        pick(),
        guards({ session: { state: 'alive' }, spent: 99 })
      );
      expect(res.reason).toBe('a session is alive');
    });

    it('the cap wins over back-off', () => {
      const res = launch(
        pick(),
        guards({
          spent: 40,
          last: { key: 'COD-1 answered', launches: 2 }
        })
      );
      expect(res.action).toBe('notify');
      expect(res.reason).toMatch(/^daily implement cap/);
    });
  });
});

// The container's jq is 1.6, which refuses a keyword as a .field or a $variable; CI's jq does not
describe('watch.jq on jq 1.6', () => {
  const KEYWORDS =
    'and|or|not|if|then|elif|else|end|as|def|reduce|foreach|try|catch|label|import|include|__loc__';
  it('uses no jq keyword as a field or variable name', () => {
    // Strings and comments in one pass, so a # in a string or a quote in a comment counts for neither
    const code = readFileSync(`${DIR}/watch.jq`, 'utf8').replace(
      /"(?:[^"\\]|\\.)*"|#.*$/gm,
      (match) => (match.startsWith('"') ? '""' : '')
    );
    expect(code.match(new RegExp(`[.$](?:${KEYWORDS})\\b`, 'g')) ?? []).toEqual(
      []
    );
  });
});
