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
      removedReason: 'FAILED_CHECKS'
    });
  });

  it('has null removal fields without an event', () => {
    expect(run('pr_state', pr())).toEqual({
      state: 'open',
      removedAt: null,
      removedReason: null
    });
  });
});

describe('step', () => {
  type Now = {
    state: string;
    removedAt: string | null;
    removedReason: string | null;
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
