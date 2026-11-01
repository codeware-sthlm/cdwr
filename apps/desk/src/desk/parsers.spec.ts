import { describe, expect, it } from 'vitest';

import {
  byCreated,
  parseAttended,
  parseHandoffs,
  parseIdea,
  parseJob,
  parsePlan,
  parseSuggested,
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
      table: { before: [], label: [], after: [] }
    });
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
      parked: [{ ticket: 'COD-4', wait: 'checks', pr: 7, resolved: false }],
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
    expect(view?.parked).toEqual([
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
