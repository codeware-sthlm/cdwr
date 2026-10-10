import { spawnSync } from 'node:child_process';
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

    it('caps hand-off tickets at limit - 3', () => {
      const r = used([
        review('COD-1'),
        done('COD-2', 1),
        done('COD-3', 2),
        done('COD-4', 3),
        done('COD-5', 4)
      ]);
      expect(r).toEqual({
        used: 3,
        open: ['COD-1'],
        handoffs: ['COD-2', 'COD-3', 'COD-4', 'COD-5']
      });
    });

    it('counts open reviews fully', () => {
      expect(used([review('A'), review('B'), review('C')]).used).toBe(3);
    });

    it('ignores hand-offs completed over 14 days ago', () => {
      expect(used([done('A', 15)]).used).toBe(0);
      expect(used([done('A', 13)]).used).toBe(1);
    });

    it('ignores completed tickets without hand-offs', () => {
      const n = done('A', 1);
      n.comments.nodes = [prReady(false)];
      expect(used([n]).used).toBe(0);
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
        'idle: waits on COD-1 input, COD-2 PR, COD-3 hand-offs; limit 2/5'
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
});
