import { describe, expect, it } from 'vitest';

import {
  byCreated,
  openApply,
  parseApplyList,
  parseAttended,
  parseDeploy,
  parseHandoffs,
  parseIdea,
  parseJob,
  parseNotify,
  parsePlan,
  parseReviewRow,
  parseSuggested,
  parseWatch,
  queueViewIssues,
  validateQueueView
} from './parsers';

describe('parsePlan', () => {
  const table = [
    '| Step | Status |',
    '| ---- | ------ |',
    '| One | Done |',
    '| Two | done in a PR |',
    '| Three | Todo |'
  ].join('\n');

  it.each([
    ['counts steps and done rows', table, { steps: 3, done: 2, next: null }],
    [
      'reads the Next line',
      `${table}\n\n**Next:** step three`,
      { steps: 3, done: 2, next: 'step three' }
    ],
    [
      'reads Next with the colon outside the bold',
      '**Next**: ship it',
      { steps: 0, done: 0, next: 'ship it' }
    ],
    [
      'reads the Next line, not a mention of it in the text',
      'The **Next:** line holds the wait.\n\n**Next:** `Waiting: CI · PR 7 · since x`',
      { steps: 0, done: 0, next: '`Waiting: CI · PR 7 · since x`' }
    ],
    [
      'ignores a table without Step and Status headers',
      '| Name | Value |\n| - | - |\n| a | b |',
      { steps: 0, done: 0, next: null }
    ],
    [
      'stops at the first line that is not a table row',
      `${table}\nprose\n| Four | Done |`,
      { steps: 3, done: 2, next: null }
    ],
    ['takes null', null, { steps: 0, done: 0, next: null }],
    ['takes undefined', undefined, { steps: 0, done: 0, next: null }],
    ['takes an empty description', '', { steps: 0, done: 0, next: null }]
  ])('%s', (_name, desc, expected) => {
    expect(parsePlan(desc)).toEqual(expected);
  });
});

describe('parseSuggested', () => {
  it.each([
    [
      'a suggested ticket',
      'Suggested: 2026-10-28 · COD-12 Trim the cache',
      {
        date: '2026-10-28',
        kind: 'suggested',
        ticket: 'COD-12',
        title: 'Trim the cache',
        text: 'COD-12 Trim the cache'
      }
    ],
    [
      'a ticket still open',
      'Suggested: 2026-10-28 · COD-12 still open',
      {
        date: '2026-10-28',
        kind: 'open',
        ticket: 'COD-12',
        text: 'COD-12 still open'
      }
    ],
    [
      'nothing today',
      'Suggested: 2026-10-28 · nothing today',
      { date: '2026-10-28', kind: 'nothing', text: 'nothing today' }
    ],
    [
      'the budget',
      'Suggested: 2026-10-28 · stopped at the budget',
      { date: '2026-10-28', kind: 'cap', text: 'stopped at the budget' }
    ],
    [
      'a failure',
      'Suggested: 2026-10-28 · failed',
      { date: '2026-10-28', kind: 'failed', text: 'failed' }
    ],
    [
      'no verdict',
      'Suggested: 2026-10-28 · no verdict',
      { date: '2026-10-28', kind: 'other', text: 'no verdict' }
    ],
    [
      'a mention tag around the id',
      'Suggested: 2026-10-28 · <issue id="x">COD-12</issue> Trim',
      {
        date: '2026-10-28',
        kind: 'suggested',
        ticket: 'COD-12',
        title: 'Trim',
        text: 'COD-12 Trim'
      }
    ],
    [
      'the line among others',
      'Last run: x\nSuggested: 2026-10-28 · failed\nJob: y',
      { date: '2026-10-28', kind: 'failed', text: 'failed' }
    ]
  ])('reads %s', (_name, text, expected) => {
    expect(parseSuggested(text)).toEqual(expected);
  });

  it.each([
    ['no Suggested line', 'Attended: idle: x'],
    ['no separator', 'Suggested: 2026-10-28 nothing today'],
    ['a malformed date', 'Suggested: 28/10/2026 · nothing today'],
    ['an empty string', ''],
    ['null', null],
    ['undefined', undefined]
  ])('gives null for %s', (_name, text) => {
    expect(parseSuggested(text)).toBeNull();
  });

  it('drops a stray angle bracket and keeps the text after an unclosed one', () => {
    expect(parseSuggested('Suggested: 2026-10-28 · a < b')).toEqual({
      date: '2026-10-28',
      kind: 'other',
      text: 'a  b'
    });
    expect(parseSuggested('Suggested: 2026-10-28 · fine > ok')).toEqual({
      date: '2026-10-28',
      kind: 'other',
      text: 'fine  ok'
    });
  });

  it('is linear on a long run of brackets', () => {
    const text = `Suggested: 2026-10-28 · ${'<'.repeat(50000)}`;
    expect(parseSuggested(text)?.kind).toBe('other');
  });
});

describe('parseIdea', () => {
  const desc = [
    '## Evidence',
    '- first',
    '* second',
    'prose',
    '',
    '## What changes',
    'Do the thing.',
    '',
    '## Cost',
    'Small',
    '',
    '## Focus',
    'dx, maintenance',
    '',
    '## Why now',
    'Because.',
    'Accept: agent:ready',
    'More.'
  ].join('\n');

  it('reads each section', () => {
    expect(parseIdea(desc)).toEqual({
      evidence: ['first', 'second'],
      change: 'Do the thing.',
      cost: 'Small',
      focus: 'dx',
      why: 'Because.\nMore.'
    });
  });

  it('fills missing sections with empty text', () => {
    expect(parseIdea('## What changes\nOnly this')).toEqual({
      evidence: [],
      change: 'Only this',
      cost: '',
      focus: '',
      why: ''
    });
  });

  it.each([
    ['no sections', 'just text'],
    ['an empty string', ''],
    ['null', null],
    ['undefined', undefined]
  ])('gives null for %s', (_name, input) => {
    expect(parseIdea(input)).toBeNull();
  });
});

describe('parseHandoffs', () => {
  const ready = (body: string, createdAt: string) => ({ body, createdAt });
  const checklist = [
    '**Agent: PR ready**',
    '',
    '**Hand-off checklist:**',
    '- [ ] run the e2e',
    '- [x] checked',
    '* [ ]  deploy  ',
    '',
    'trailing prose'
  ].join('\n');

  it('lists the unticked items of the newest PR-ready comment', () => {
    expect(
      parseHandoffs([
        ready('**Agent: PR ready**\n\nHand-off checklist:\n- [ ] old', '1'),
        ready(checklist, '3'),
        ready('**Agent: PR ready**\nHand-off checklist:\n- [ ] mid', '2'),
        ready('hello', '4')
      ])
    ).toEqual(['run the e2e', 'deploy']);
  });

  it('stops at the first line that is not a checklist item', () => {
    expect(
      parseHandoffs([
        ready(
          '**Agent: PR ready**\nhand-off checklist:\n- [ ] a\nplain\n- [ ] b',
          '1'
        )
      ])
    ).toEqual(['a']);
  });

  it('drops a struck item, with or without a reason', () => {
    expect(
      parseHandoffs([
        ready(
          '**Agent: PR ready**\nHand-off checklist:\n- [ ] ~~a~~\n- [ ] ~~b~~ dropped: CI covers it\n- [ ] c\nDrop one: strike it through, or say why in a comment.',
          '1'
        )
      ])
    ).toEqual(['c']);
  });

  it.each([
    ['no comments', []],
    ['null', null],
    ['undefined', undefined],
    ['no PR-ready comment', [ready('hello', '1')]],
    ['no checklist', [ready('**Agent: PR ready**\nDone', '1')]],
    [
      'a comment without a body',
      [{ createdAt: '1' }, { body: null, createdAt: '2' }]
    ]
  ])('gives nothing for %s', (_name, comments) => {
    expect(parseHandoffs(comments)).toEqual([]);
  });
});

describe('parseApplyList', () => {
  const body = (...lines: string[]) => [
    { body: ['**Agent: PR ready**', '', ...lines].join('\n'), createdAt: '1' }
  ];

  it.each([
    [
      'a plain item',
      ['- [ ] restart cdwr-cms'],
      {
        spec: 'restart cdwr-cms',
        kind: 'restart',
        args: ['cdwr-cms'],
        afterDeploy: false,
        checked: false,
        dropped: false,
        outcome: null
      }
    ],
    [
      'after-deploy taken off the args',
      ['- [ ] scale cdwr-cms 2 after-deploy'],
      {
        spec: 'scale cdwr-cms 2 after-deploy',
        kind: 'scale',
        args: ['cdwr-cms', '2'],
        afterDeploy: true,
        checked: false,
        dropped: false,
        outcome: null
      }
    ],
    [
      'an applied item with its outcome',
      ['* [X] restart cdwr-cms · applied 2026-11-20T07:12Z'],
      {
        spec: 'restart cdwr-cms',
        kind: 'restart',
        args: ['cdwr-cms'],
        afterDeploy: false,
        checked: true,
        dropped: false,
        outcome: 'applied 2026-11-20T07:12Z'
      }
    ],
    [
      'a refused item',
      ['- [ ] supabase-migration a.sql · refused: already applied'],
      {
        kind: 'supabase-migration',
        args: ['a.sql'],
        checked: false,
        dropped: false,
        outcome: 'refused: already applied'
      }
    ],
    [
      'a dropped item',
      ['- [ ] ~~deploy-workflow cms production~~ dropped by hand'],
      { checked: false, dropped: true, outcome: null }
    ],
    ['an item without arguments', ['- [ ] agent-deploy'], { args: [] }]
  ])('reads %s', (_name, lines, want) => {
    expect(parseApplyList(body('Apply list:', ...lines))).toMatchObject([want]);
  });

  it('reads a bold header, skips blank lines and stops at other text', () => {
    const items = parseApplyList(
      body(
        '**Apply list:**',
        '',
        '- [ ] restart cdwr-cms',
        '',
        '- [x] agent-deploy',
        'prose',
        '- [ ] restart cdwr-headless-x'
      )
    );
    expect(items.map((i) => i.spec)).toEqual([
      'restart cdwr-cms',
      'agent-deploy'
    ]);
  });

  it('reads only the newest PR-ready comment', () => {
    const items = parseApplyList([
      {
        body: '**Agent: PR ready**\nApply list:\n- [ ] agent-deploy',
        createdAt: '2'
      },
      {
        body: '**Agent: PR ready**\nApply list:\n- [ ] restart cdwr-cms',
        createdAt: '1'
      },
      { body: 'hello', createdAt: '3' }
    ]);
    expect(items.map((i) => i.spec)).toEqual(['agent-deploy']);
  });

  it('counts only items not applied and not dropped as open', () => {
    const items = parseApplyList(
      body(
        'Apply list:',
        '- [x] restart cdwr-cms · applied now',
        '- [ ] ~~agent-deploy~~',
        '- [ ] scale cdwr-cms 2 · refused: no DESK_FLY_TOKEN on nuc',
        '- [ ] deploy-workflow cms production'
      )
    );
    expect(openApply(items).map((i) => i.kind)).toEqual([
      'scale',
      'deploy-workflow'
    ]);
  });

  it.each([
    ['no comments', []],
    ['null', null],
    ['no list', body('Hand-off checklist:', '- [ ] a')],
    ['an empty list', body('Apply list:', 'prose')]
  ])('gives nothing for %s', (_name, comments) => {
    expect(parseApplyList(comments)).toEqual([]);
  });
});

describe('byCreated', () => {
  it('orders by the createdAt text', () => {
    expect([{ createdAt: 'b' }, { createdAt: 'a' }].sort(byCreated)).toEqual([
      { createdAt: 'a' },
      { createdAt: 'b' }
    ]);
  });
});

describe('parseJob', () => {
  it.each([
    [
      'a current launchd install',
      'Job: every 10 min · install current',
      {
        line: 'every 10 min · install current',
        minutes: 10,
        live: false,
        host: 'launchd',
        rev: null,
        install: 'current',
        items: ''
      }
    ],
    [
      'a stale launchd install',
      'Job: every 10 min · install out of date (run.sh, interval)',
      {
        line: 'every 10 min · install out of date (run.sh, interval)',
        minutes: 10,
        live: false,
        host: 'launchd',
        rev: null,
        install: 'stale',
        items: 'run.sh, interval'
      }
    ],
    [
      'an unknown launchd install',
      'Job: every 5 min · install unknown',
      {
        line: 'every 5 min · install unknown',
        minutes: 5,
        live: false,
        host: 'launchd',
        rev: null,
        install: 'unknown',
        items: ''
      }
    ],
    [
      'a container image',
      'Job: every 10 min · image sha-9c7a20d',
      {
        line: 'every 10 min · image sha-9c7a20d',
        minutes: 10,
        live: false,
        host: 'container',
        rev: 'sha-9c7a20d',
        install: 'current',
        items: ''
      }
    ],
    [
      'a container image out of date',
      'Job: every 10 min · image sha-9c7a20d out of date (run.sh)',
      {
        line: 'every 10 min · image sha-9c7a20d out of date (run.sh)',
        minutes: 10,
        live: false,
        host: 'container',
        rev: 'sha-9c7a20d',
        install: 'stale',
        items: 'run.sh'
      }
    ],
    [
      'a live container',
      'Job: live · fallback 60 min · image sha-9c7a20d',
      {
        line: 'live · fallback 60 min · image sha-9c7a20d',
        minutes: 60,
        live: true,
        host: 'container',
        rev: 'sha-9c7a20d',
        install: 'current',
        items: ''
      }
    ],
    [
      'a local container build',
      'Job: · image',
      {
        line: '· image',
        minutes: null,
        live: false,
        host: 'container',
        rev: null,
        install: 'current',
        items: ''
      }
    ],
    [
      'a container with an unknown state',
      'Job: · image unknown',
      {
        line: '· image unknown',
        minutes: null,
        live: false,
        host: 'container',
        rev: null,
        install: 'unknown',
        items: ''
      }
    ],
    [
      'an out-of-date list that never closes',
      'Job: · install out of date (run.sh',
      {
        line: '· install out of date (run.sh',
        minutes: null,
        live: false,
        host: 'launchd',
        rev: null,
        install: 'stale',
        items: ''
      }
    ],
    [
      'a line with no host',
      'Job: something else',
      {
        line: 'something else',
        minutes: null,
        live: false,
        host: null,
        rev: null,
        install: 'unknown',
        items: ''
      }
    ]
  ])('reads %s', (_name, text, expected) => {
    expect(parseJob(text)).toEqual({
      effort: null,
      paused: false,
      ...expected
    });
  });

  it.each([
    [
      'the effort of a live container',
      'Job: live · fallback 60 min · image sha-0123456 · effort $12.50 of $40',
      { spent: 12.5, cap: 40 },
      false
    ],
    [
      'a pause after the effort',
      'Job: live · fallback 60 min · image sha-0123456 · effort $12.50 of $40 · paused',
      { spent: 12.5, cap: 40 },
      true
    ],
    [
      'a pause without an effort',
      'Job: every 10 min · install current · paused',
      null,
      true
    ],
    [
      'an effort of 0 on launchd',
      'Job: every 10 min · install out of date (run.sh) · effort $0.00 of $12.5',
      { spent: 0, cap: 12.5 },
      false
    ]
  ])('reads %s', (_name, text, effort, paused) => {
    const job = parseJob(text);
    expect(job?.effort).toEqual(effort);
    expect(job?.paused).toBe(paused);
  });

  it('leaves rev, install and items as they were with the appended segments', () => {
    const job = parseJob(
      'Job: live · fallback 60 min · image sha-0123456 · effort $12.50 of $40 · paused'
    );
    expect(job).toMatchObject({
      minutes: 60,
      live: true,
      host: 'container',
      rev: 'sha-0123456',
      install: 'current',
      items: ''
    });
    expect(
      parseJob(
        'Job: every 10 min · install out of date (run.sh, interval) · effort $1.00 of $40 · paused'
      )
    ).toMatchObject({
      host: 'launchd',
      install: 'stale',
      items: 'run.sh, interval'
    });
  });

  it.each([
    ['no Job line', 'Attended: idle: x'],
    ['an empty Job line', 'Job:   '],
    ['an empty string', ''],
    ['null', null],
    ['undefined', undefined]
  ])('gives null for %s', (_name, text) => {
    expect(parseJob(text)).toBeNull();
  });
});

describe('parseAttended', () => {
  it.each([
    [
      'running',
      'Attended: running: COD-1 · Next: step 2',
      { verdict: 'running', text: 'COD-1 · Next: step 2' }
    ],
    [
      'run now',
      'Attended: run now: COD-2 answered',
      { verdict: 'run now', text: 'COD-2 answered' }
    ],
    [
      'idle',
      'Attended: idle: waits on review; limit 3/5',
      { verdict: 'idle', text: 'waits on review; limit 3/5' }
    ],
    [
      'a multi-word reason',
      'Attended: run now: COD-4 conflicts with main',
      { verdict: 'run now', text: 'COD-4 conflicts with main' }
    ],
    [
      'a mention tag',
      'Attended: run now: <issue id="x">COD-3</issue> ready',
      { verdict: 'run now', text: 'COD-3 ready' }
    ]
  ])('reads %s', (_name, text, expected) => {
    expect(parseAttended(text)).toEqual(expected);
  });

  it.each([
    ['no Attended line', 'Job: x'],
    ['an unknown verdict', 'Attended: sleeping: zzz'],
    ['a verdict without a colon', 'Attended: idle'],
    ['an empty string', ''],
    ['null', null],
    ['undefined', undefined]
  ])('gives null for %s', (_name, text) => {
    expect(parseAttended(text)).toBeNull();
  });
});

describe('validateQueueView', () => {
  const limit = { used: 1, max: 3 };

  it('gives a partial view the defaults', () => {
    expect(validateQueueView({ limit, table: {} })).toEqual({
      at: undefined,
      limit,
      session: { state: 'none' },
      next: [],
      held: { tickets: [], free: [] },
      parked: [],
      blocked: [],
      renovate: [],
      audit: [],
      tree: [],
      table: { before: [], label: [], after: [] }
    });
  });

  it('reads the tree and drops a malformed node alone', () => {
    const child = {
      ticket: 'COD-2',
      title: 'Child',
      state: 'started',
      label: 'agent:working',
      pr: 12,
      position: 2,
      waiting: false,
      blockers: ['COD-9'],
      gaps: [{ kind: 'two-labels', candidate: false }],
      children: []
    };
    const root = {
      ticket: 'COD-1',
      title: 'Root',
      state: 'started',
      label: null,
      pr: null,
      position: null,
      waiting: false,
      blockers: [],
      gaps: [],
      truncated: true,
      children: [child]
    };
    expect(
      validateQueueView({
        limit,
        table: {},
        tree: [
          root,
          { ticket: 3 },
          { ...root, ticket: 'COD-4', children: [child, { id: 1 }] }
        ]
      })?.tree
    ).toEqual([root, { ...root, ticket: 'COD-4' }]);
  });

  it('defaults what a tree node leaves out', () => {
    expect(
      validateQueueView({ limit, table: {}, tree: [{ ticket: 'COD-1' }] })?.tree
    ).toEqual([
      {
        ticket: 'COD-1',
        title: null,
        state: null,
        label: null,
        pr: null,
        position: null,
        waiting: false,
        blockers: [],
        gaps: [],
        children: []
      }
    ]);
  });

  it('reads a gap as an object, or as a bare kind from an older scheduler', () => {
    const gaps = (value: unknown) =>
      validateQueueView({
        limit,
        table: {},
        tree: [{ ticket: 'COD-1', gaps: value }]
      })?.tree[0]?.gaps;
    expect(
      gaps([
        'two-labels',
        { kind: 'untouched', candidate: true },
        { kind: 'held' }
      ])
    ).toEqual([
      { kind: 'two-labels', candidate: false },
      { kind: 'untouched', candidate: true },
      { kind: 'held', candidate: false }
    ]);
  });

  it('reads a tree node position, null when missing or not a number', () => {
    const positions = (position: unknown) =>
      validateQueueView({
        limit,
        table: {},
        tree: [{ ticket: 'COD-1', position }]
      })?.tree.map((n) => n.position);
    expect(positions(3)).toEqual([3]);
    expect(positions(null)).toEqual([null]);
    expect(positions(undefined)).toEqual([null]);
  });

  it('reads a view without a tree as empty', () => {
    expect(validateQueueView({ limit, table: {} })?.tree).toEqual([]);
    expect(validateQueueView({ limit, table: {}, tree: null })?.tree).toEqual(
      []
    );
  });

  it('reads a candidate gap with its rows, and an older gap without', () => {
    const gap = {
      id: 'COD-5:untouched',
      ticket: 'COD-5',
      kind: 'untouched',
      what: 'Check COD-5',
      fix: 'Look'
    };
    expect(
      validateQueueView({
        limit,
        table: {},
        audit: [
          { ...gap, candidate: true, rows: ['4 | Cutover | Planned'] },
          gap
        ]
      })?.audit
    ).toEqual([
      { ...gap, candidate: true, rows: ['4 | Cutover | Planned'] },
      gap
    ]);
  });

  it('reads the audit and drops a malformed gap alone', () => {
    const gap = {
      id: 'COD-5:two-labels',
      ticket: 'COD-5',
      kind: 'two-labels',
      what: 'COD-5 carries two labels',
      fix: 'Keep one'
    };
    expect(
      validateQueueView({ limit, table: {}, audit: [gap, { id: 1 }] })?.audit
    ).toEqual([gap]);
    expect(validateQueueView({ limit, table: {}, audit: null })?.audit).toEqual(
      []
    );
  });

  it('defaults null members the same way', () => {
    expect(
      validateQueueView({
        limit,
        session: null,
        next: null,
        held: null,
        parked: null,
        table: { before: null, after: null }
      })
    ).toEqual(validateQueueView({ limit, table: {} }));
  });

  it('keeps what a full view carries', () => {
    const view = {
      at: '2026-10-28T10:00:00Z',
      limit,
      session: { state: 'alive', detail: 'polling', lastSeen: 'x' },
      next: [{ ticket: 'COD-1', reason: 'ready', detail: null }],
      held: {
        tickets: ['COD-2'],
        free: [{ action: 'review', ticket: 'COD-3', pr: 12 }]
      },
      parked: [
        {
          ticket: 'COD-4',
          wait: 'checks',
          pr: 7,
          resolved: false,
          copilot: null,
          copilotAsked: null
        }
      ],
      blocked: [{ ticket: 'COD-8', blockers: ['COD-3', 'COD-9'] }],
      renovate: [
        { pr: 754, title: 'Update vite', state: 'failing', ticket: null }
      ],
      audit: [],
      tree: [],
      table: {
        before: [{ ticket: 'COD-5', kind: 'plan' }],
        label: [{ ticket: 'COD-7', parent: 'COD-1', blockers: [] }],
        after: [{ ticket: 'COD-6', kind: 'handoffs', items: ['a'] }]
      }
    };
    expect(validateQueueView(view)).toEqual(view);
  });

  it('reads null in every optional field as absent and keeps the other entries', () => {
    const view = validateQueueView({
      at: null,
      limit,
      next: [
        { ticket: 'COD-1', reason: null, detail: null },
        { ticket: 'COD-2', reason: 'ready' }
      ],
      held: {
        tickets: ['COD-3'],
        free: [
          { action: null, ticket: null, pr: null, value: null },
          { action: 'review', ticket: 'COD-4', value: 2 }
        ]
      },
      parked: [
        { ticket: 'COD-5', wait: null, since: null },
        { ticket: 'COD-6', wait: 'ci', since: '2026-10-28T10:00:00Z' }
      ],
      table: {
        before: [
          { ticket: 'COD-7', kind: null },
          { ticket: 'COD-8', kind: 'plan' }
        ],
        after: [
          { ticket: 'COD-9', kind: null, items: null },
          { ticket: 'COD-10', kind: 'handoffs', items: ['a'] }
        ]
      }
    });
    expect(view?.at).toBeUndefined();
    expect(view?.next).toEqual([
      { ticket: 'COD-1', reason: undefined, detail: null },
      { ticket: 'COD-2', reason: 'ready' }
    ]);
    expect(view?.held.tickets).toEqual(['COD-3']);
    expect(view?.held.free).toEqual([
      { action: undefined, ticket: undefined, pr: null, value: undefined },
      { action: 'review', ticket: 'COD-4', value: 2 }
    ]);
    expect(view?.parked).toMatchObject([
      { ticket: 'COD-5', wait: undefined, since: undefined },
      { ticket: 'COD-6', wait: 'ci', since: '2026-10-28T10:00:00Z' }
    ]);
    expect(view?.table.before).toEqual([
      { ticket: 'COD-7', kind: undefined },
      { ticket: 'COD-8', kind: 'plan' }
    ]);
    expect(view?.table.after).toEqual([
      { ticket: 'COD-9', kind: undefined, items: undefined },
      { ticket: 'COD-10', kind: 'handoffs', items: ['a'] }
    ]);
  });

  it('reads the Copilot state and request of a parked wait, null on an older view', () => {
    const view = validateQueueView({
      limit,
      parked: [
        {
          ticket: 'COD-1',
          wait: 'copilot',
          copilot: 'none',
          copilotAsked: { at: '2026-10-28T10:00:00Z', ok: false, why: 'denied' }
        },
        {
          ticket: 'COD-2',
          wait: 'copilot',
          copilot: null,
          copilotAsked: { at: '2026-10-28T10:00:00Z', ok: true }
        },
        { ticket: 'COD-3', wait: 'ci' },
        { ticket: 'COD-4', wait: 'copilot', copilot: 'bogus', copilotAsked: 3 }
      ],
      table: {}
    });
    expect(view?.parked.map((p) => [p.copilot, p.copilotAsked])).toEqual([
      ['none', { at: '2026-10-28T10:00:00Z', ok: false, why: 'denied' }],
      [null, { at: '2026-10-28T10:00:00Z', ok: true, why: null }],
      [null, null],
      [null, null]
    ]);
  });

  it('reads blocked, dropping nothing and defaulting a missing key', () => {
    expect(validateQueueView({ limit, table: {} })?.blocked).toEqual([]);
    expect(
      validateQueueView({
        limit,
        blocked: [{ ticket: 'COD-8', blockers: null }],
        table: {}
      })?.blocked
    ).toEqual([{ ticket: 'COD-8', blockers: [] }]);
  });

  it('reads renovate, dropping what is malformed and defaulting a missing key', () => {
    const renovate = (r: unknown) =>
      validateQueueView({ limit, renovate: r, table: {} })?.renovate;
    expect(
      renovate([
        { pr: 662, title: 'Update zod', state: 'tended', ticket: 'COD-740' },
        { pr: 754, state: 'failing' },
        { pr: 800, title: 'x', state: 'nap' },
        { title: 'no pr', state: 'failing' }
      ])
    ).toEqual([
      { pr: 662, title: 'Update zod', state: 'tended', ticket: 'COD-740' },
      { pr: 754, title: '', state: 'failing', ticket: null }
    ]);
    expect(renovate(undefined)).toEqual([]);
    expect(renovate(null)).toEqual([]);
  });

  it('reads table.label, dropping what is malformed', () => {
    const label = (l: unknown) =>
      validateQueueView({ limit, table: { label: l } })?.table.label;
    expect(
      label([
        { ticket: 'COD-1', parent: 'COD-9', blockers: ['COD-2'] },
        { ticket: 'COD-3', parent: null },
        { parent: 'COD-9' }
      ])
    ).toEqual([
      { ticket: 'COD-1', parent: 'COD-9', blockers: ['COD-2'] },
      { ticket: 'COD-3', parent: null, blockers: [] }
    ]);
    expect(label(undefined)).toEqual([]);
    expect(label(null)).toEqual([]);
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['a string', 'x'],
    ['no limit', { table: {} }],
    ['no table', { limit }]
  ])('gives null for %s', (_name, view) => {
    expect(validateQueueView(view)).toBeNull();
  });
});

describe('queueViewIssues', () => {
  const limit = { used: 1, max: 3 };

  it('is empty for a view that parses', () => {
    expect(queueViewIssues({ limit, table: {} })).toEqual([]);
  });

  it('names a missing field', () => {
    expect(queueViewIssues({ limit })).toEqual([
      { path: 'table', missing: true }
    ]);
  });

  it('names a wrong-typed field by its path', () => {
    expect(
      queueViewIssues({ limit: { used: 'x', max: 3 }, table: {} })
    ).toEqual([{ path: 'limit.used', missing: false }]);
  });

  it('names the view itself when it is not an object', () => {
    expect(queueViewIssues(null)).toEqual([{ path: '', missing: false }]);
  });
});

describe('parseReviewRow', () => {
  const row = {
    id: 3,
    host: 'nuc',
    at: '2026-11-08T10:00:00Z',
    brief: 'Two PRs wait on you',
    actions: [
      {
        ticket: 'COD-1',
        action: 'Merge it',
        why: 'Checks passed',
        evidence: []
      }
    ],
    findings: [
      {
        id: 'stale-pr:COD-2:0a1b2c3d',
        ticket: 'COD-2',
        kind: 'stale PR',
        severity: 'blocks',
        evidence: ['no push in 9 days'],
        fix: 'Rebase it'
      }
    ],
    stale: [{ ticket: 'COD-4', why: 'Untouched for 30 days', evidence: [] }],
    suggestions: [{ ticket: 'COD-5', why: 'Quick win' }],
    cost: 0.42,
    model: 'sonnet'
  };

  it('reads the jsonb through the review schema and keeps the row fields', () => {
    expect(parseReviewRow(row)).toEqual({
      brief: row.brief,
      actions: row.actions,
      findings: row.findings,
      stale: row.stale,
      suggestions: row.suggestions,
      own: null,
      id: 3,
      host: 'nuc',
      at: '2026-11-08T10:00:00Z',
      cost: 0.42,
      model: 'sonnet'
    });
  });

  describe('own', () => {
    const own = {
      since: '2026-11-07T10:00:00Z',
      until: '2026-11-08T10:00:00Z',
      items: [
        {
          at: '2026-11-07T12:00:00Z',
          kind: 'merge',
          ticket: 'COD-1',
          pr: 7,
          title: 'A PR',
          target: null,
          result: 'merged',
          reason: null
        }
      ]
    };

    it('reads the queue own actions', () => {
      expect(parseReviewRow({ ...row, own })?.own).toEqual(own);
    });

    it.each([
      ['null', null],
      ['undefined', undefined],
      ['a value that does not parse', { since: 'x', items: 'no' }]
    ])('reads %s as none and keeps the review', (_name, value) => {
      const parsed = parseReviewRow({ ...row, own: value });
      expect(parsed?.own).toBeNull();
      expect(parsed?.brief).toBe(row.brief);
    });
  });

  it.each([
    ['findings that are not a list', { findings: {} }],
    [
      'an action without a why',
      { actions: [{ ticket: 'COD-1', action: 'x' }] }
    ],
    [
      'a finding id of another ticket',
      {
        findings: [{ ...row.findings[0], ticket: 'COD-9' }]
      }
    ],
    ['an empty brief', { brief: '' }]
  ])('reads %s as none', (_name, over) => {
    expect(parseReviewRow({ ...row, ...over })).toBeNull();
  });
});

describe('parseDeploy', () => {
  const full = {
    tag: 'sha-b',
    previous: 'sha-a',
    at: '2026-11-19T10:00:00Z',
    by: 'self',
    phase: 'checking',
    reason: null,
    failed: null
  };

  it('keeps the known fields', () => {
    expect(parseDeploy(full)).toEqual(full);
  });

  it('reads a rollback with its reason and the failed tag', () => {
    expect(
      parseDeploy({
        ...full,
        tag: 'sha-a',
        phase: 'rolled-back',
        failed: 'sha-b',
        reason: 'unhealthy'
      })
    ).toMatchObject({
      phase: 'rolled-back',
      failed: 'sha-b',
      reason: 'unhealthy'
    });
  });

  it('reads a field of the wrong type as missing', () => {
    expect(parseDeploy({ ...full, by: 'cron', previous: 3 })).toMatchObject({
      by: null,
      previous: null
    });
  });

  it.each([
    ['null', null],
    ['an array', []],
    ['a string', 'sha-b'],
    ['no tag', { ...full, tag: undefined }],
    ['an unknown phase', { ...full, phase: 'rolling' }],
    ['no time', { ...full, at: undefined }],
    ['a time that is no date', { ...full, at: 'yesterday' }]
  ])('reads %s as undefined', (_name, json) => {
    expect(parseDeploy(json)).toBeUndefined();
  });
});

describe('parseNotify', () => {
  it.each([['urgent'], ['action'], ['all']] as const)(
    'keeps the level %s',
    (level) => {
      expect(parseNotify({ level, muteUntil: null })).toEqual({ level });
    }
  );

  it('keeps a UTC mute, with or without fractions', () => {
    expect(
      parseNotify({ level: 'action', muteUntil: '2026-11-22T20:00:00Z' })
    ).toEqual({ level: 'action', muteUntil: '2026-11-22T20:00:00Z' });
    expect(
      parseNotify({ level: 'all', muteUntil: '2026-11-22T20:00:00.123Z' })
    ).toEqual({ level: 'all', muteUntil: '2026-11-22T20:00:00.123Z' });
  });

  it.each([
    ['an offset time', '2026-11-22T20:00:00+01:00'],
    ['a plain date', '2026-11-22'],
    ['a number', 5],
    ['an empty string', '']
  ])('drops a mute that is %s', (_name, muteUntil) => {
    expect(parseNotify({ level: 'urgent', muteUntil })).toEqual({
      level: 'urgent'
    });
  });

  it.each([
    ['null', null],
    ['an array', []],
    ['a string', 'urgent'],
    ['no level', { muteUntil: null }],
    ['an unknown level', { level: 'loud' }]
  ])('reads %s as undefined', (_name, json) => {
    expect(parseNotify(json)).toBeUndefined();
  });
});

describe('parseWatch', () => {
  const full = {
    pr: 812,
    state: 'open',
    unresolved: 2,
    threads: 1,
    conflicting: false,
    draft: true,
    mergeable: 'MERGEABLE',
    ci: 'SUCCESS',
    copilot: 'requested',
    mergeStateStatus: 'CLEAN',
    at: '2026-11-08T10:00:00Z',
    removedAt: null
  };

  it('keeps the known fields of an entry', () => {
    expect(parseWatch({ 'COD-1': full }).get('COD-1')).toEqual({
      pr: 812,
      state: 'open',
      unresolved: 2,
      threads: 1,
      conflicting: false,
      draft: true,
      mergeable: 'MERGEABLE',
      ci: 'SUCCESS',
      copilot: 'requested',
      at: '2026-11-08T10:00:00Z'
    });
  });

  it('reads the fields an older entry lacks as unknown', () => {
    expect(
      parseWatch({ 'COD-1': { pr: 5, state: 'queued' } }).get('COD-1')
    ).toEqual({
      pr: 5,
      state: 'queued',
      unresolved: 0,
      threads: null,
      conflicting: null,
      draft: false,
      mergeable: null,
      ci: null,
      copilot: null,
      at: null
    });
  });

  it('reads a field of the wrong type as missing', () => {
    expect(
      parseWatch({
        'COD-1': {
          ...full,
          unresolved: 'x',
          threads: '1',
          conflicting: 'no',
          draft: 'yes',
          mergeable: 'MAYBE',
          ci: 3,
          copilot: 'maybe',
          at: 7
        }
      }).get('COD-1')
    ).toEqual({
      pr: 812,
      state: 'open',
      unresolved: 0,
      threads: null,
      conflicting: null,
      draft: false,
      mergeable: null,
      ci: null,
      copilot: null,
      at: null
    });
  });

  it('drops an entry without a PR number or a known state, alone', () => {
    const watch = parseWatch({
      'COD-1': { ...full, pr: '812' },
      'COD-2': { ...full, state: 'merging' },
      'COD-3': 'open',
      'COD-4': null,
      'COD-5': [full],
      'COD-6': full
    });
    expect([...watch.keys()]).toEqual(['COD-6']);
  });

  it.each([
    ['null', null],
    ['a string', 'x'],
    ['a number', 3],
    ['an array', [full]],
    ['undefined', undefined]
  ])('is empty for %s', (_name, input) => {
    expect(parseWatch(input).size).toBe(0);
  });
});
