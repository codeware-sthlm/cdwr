import {
  type HistoryNode,
  type IssueNode,
  type RunRow,
  actorOf,
  collectEvents,
  commentEvents,
  historyEvents,
  renderActivityDocument,
  runEvents
} from './activity.logic';
import { localMinute } from './usage.logic';

const issue = (over: Partial<IssueNode> = {}): IssueNode => ({
  identifier: 'COD-1',
  ...over
});

const history = (nodes: Partial<HistoryNode>[]): IssueNode =>
  issue({
    history: {
      nodes: nodes.map((n) => ({ createdAt: '2026-10-10T10:00:00.000Z', ...n }))
    }
  });

const changes = (node: Partial<HistoryNode>): string[] =>
  historyEvents(history([node])).map((e) => e.change);

describe('historyEvents', () => {
  it.each([
    [
      'status with from',
      { fromState: { name: 'Todo' }, toState: { name: 'In Progress' } },
      'status Todo → In Progress'
    ],
    ['status without from', { toState: { name: 'Done' } }, 'status → Done'],
    [
      'labels, added first',
      {
        removedLabels: [{ name: 'agent:ready' }],
        addedLabels: [{ name: 'agent:review' }, { name: 'x' }]
      },
      '+agent:review +x −agent:ready'
    ],
    ['description edited', { updatedDescription: true }, 'description edited'],
    [
      'combined',
      {
        fromState: { name: 'Todo' },
        toState: { name: 'Done' },
        addedLabels: [{ name: 'a' }],
        updatedDescription: true
      },
      'status Todo → Done, +a, description edited'
    ]
  ])('%s', (_name, node, expected) => {
    expect(changes(node)).toEqual([expected]);
  });

  it.each([
    ['nothing at all', {}],
    ['description not edited', { updatedDescription: false }],
    ['empty label lists', { addedLabels: [], removedLabels: [] }],
    ['only a from state', { fromState: { name: 'Todo' } }]
  ])('skips a node with %s', (_name, node) => {
    expect(changes(node)).toEqual([]);
  });

  it('carries ticket, time and actor', () => {
    const [event] = historyEvents(
      history([{ toState: { name: 'Done' }, actor: { name: 'Håkan' } }])
    );
    expect(event).toEqual({
      at: new Date('2026-10-10T10:00:00.000Z'),
      ticket: 'COD-1',
      actor: 'Håkan',
      change: 'status → Done'
    });
  });

  it('copes with missing history', () => {
    expect(historyEvents(issue())).toEqual([]);
    expect(historyEvents(issue({ history: { nodes: null } }))).toEqual([]);
  });
});

describe('commentEvents', () => {
  const comment = (body: string | null) =>
    commentEvents(
      issue({
        comments: {
          nodes: [{ createdAt: '2026-10-10T10:00:00.000Z', body }]
        }
      })
    ).map((e) => e.change);

  it.each([
    ['one line', 'Looks good', 'comment: Looks good'],
    [
      'first non-empty line, trimmed',
      '\n  \n  Hello  \nsecond',
      'comment: Hello'
    ],
    ['exactly 80 chars', 'a'.repeat(80), `comment: ${'a'.repeat(80)}`],
    ['over 80 chars', 'a'.repeat(81), `comment: ${'a'.repeat(80)}…`],
    ['no body', null, 'comment: ']
  ])('%s', (_name, body, expected) => {
    expect(comment(body)).toEqual([expected]);
  });
});

describe('actorOf', () => {
  it.each([
    [
      'Agent marker',
      { body: '  **Agent plan**', user: { name: 'Håkan' } },
      'agent'
    ],
    [
      'Agent marker beats a bot',
      { body: '**Agent', botActor: { name: 'Bot' } },
      'agent'
    ],
    [
      'bot name',
      { botActor: { name: 'Bot', type: 'api' }, user: { name: 'H' } },
      'Bot'
    ],
    [
      'bot type only',
      { botActor: { type: 'api' }, user: { name: 'H' } },
      'api'
    ],
    ['empty bot falls through', { botActor: {}, user: { name: 'H' } }, 'H'],
    ['user', { user: { name: 'Håkan' } }, 'Håkan'],
    ['actor', { actor: { name: 'Håkan' } }, 'Håkan'],
    ['unknown', { user: null, botActor: null }, 'unknown'],
    ['not the marker', { body: 'Agent said', user: { name: 'H' } }, 'H']
  ])('%s', (_name, args, expected) => {
    expect(actorOf(args)).toBe(expected);
  });
});

describe('runEvents', () => {
  const row = (over: Partial<RunRow> = {}): RunRow => ({
    when: '2026-10-10 08:05',
    outcome: 'planned',
    ticket: 'COD-2',
    detail: '',
    ...over
  });

  it('reads when as local time', () => {
    const [event] = runEvents([row()]);
    expect(localMinute(event.at)).toBe('2026-10-10 08:05');
    expect(event.at).toEqual(new Date(2026, 9, 10, 8, 5));
  });

  it.each([
    [row(), 'COD-2', 'run: planned'],
    [row({ detail: 'two steps' }), 'COD-2', 'run: planned — two steps'],
    [row({ ticket: '' }), '—', 'run: planned']
  ])('%j', (r, ticket, change) => {
    expect(runEvents([r])).toMatchObject([
      { actor: 'scheduler', ticket, change }
    ]);
  });

  it('skips rows with an invalid date', () => {
    expect(runEvents([row({ when: 'soon' }), row({ when: '' })])).toEqual([]);
  });
});

describe('collectEvents', () => {
  const now = new Date(2026, 9, 10, 12, 0);
  const at = (day: number, hour = 12) =>
    new Date(2026, 9, day, hour, 0).toISOString();
  const response = {
    data: {
      issues: {
        nodes: [
          issue({
            history: {
              nodes: [
                { createdAt: at(9), toState: { name: 'A' } },
                { createdAt: at(1), toState: { name: 'Old' } }
              ]
            },
            comments: { nodes: [{ createdAt: at(10, 8), body: 'hi' }] }
          })
        ]
      }
    }
  };
  const rows: RunRow[] = [
    { when: '2026-10-09 12:00', outcome: 'idle', ticket: '', detail: '' }
  ];

  it('keeps the window, newest first, ties in input order', () => {
    const { events, dropped } = collectEvents(response, rows, {
      now,
      windowDays: 7,
      limit: 10
    });
    expect(events.map((e) => e.change)).toEqual([
      'comment: hi',
      'status → A',
      'run: idle'
    ]);
    expect(dropped).toBe(0);
  });

  it('includes an event exactly at the window edge', () => {
    const edge = {
      when: '2026-10-03 12:00',
      outcome: 'x',
      ticket: '',
      detail: ''
    };
    const { events } = collectEvents({}, [edge], {
      now,
      windowDays: 7,
      limit: 10
    });
    expect(events).toHaveLength(1);
  });

  it('caps at the limit and counts what it cut', () => {
    const { events, dropped } = collectEvents(response, rows, {
      now,
      windowDays: 7,
      limit: 2
    });
    expect(events.map((e) => e.change)).toEqual(['comment: hi', 'status → A']);
    expect(dropped).toBe(1);
  });

  it('copes with an empty or null response', () => {
    const opts = { now, windowDays: 7, limit: 5 };
    expect(collectEvents({}, [], opts)).toEqual({ events: [], dropped: 0 });
    expect(collectEvents({ data: { issues: null } }, [], opts).events).toEqual(
      []
    );
  });
});

describe('renderActivityDocument', () => {
  const event = (
    over: Partial<Parameters<typeof renderActivityDocument>[0][0]> = {}
  ) => ({
    at: new Date(2026, 9, 10, 20, 1),
    ticket: 'COD-540',
    actor: 'Håkan Ströberg',
    change: 'status Todo → In Progress',
    ...over
  });
  const opts = { updated: '2026-10-10 20:30', windowDays: 7, dropped: 0 };

  it('renders the contract', () => {
    expect(renderActivityDocument([event()], opts)).toBe(
      [
        'Updated: 2026-10-10 20:30 · last 7 days · 1 events',
        '',
        'Written by the agent queue scheduler from Linear\'s issue history and its own runs. Times are local. Actor "agent" is a comment marked `**Agent`; the agent and Håkan otherwise write through the same Linear account.',
        '',
        '| When | Ticket | Actor | Change |',
        '| -- | -- | -- | -- |',
        '| 2026-10-10 20:01 | COD-540 | Håkan Ströberg | status Todo → In Progress |'
      ].join('\n')
    );
  });

  it('escapes pipes and flattens newlines', () => {
    const doc = renderActivityDocument([event({ change: 'a | b\nc' })], opts);
    expect(doc).toContain('| a \\| b c |');
  });

  it('mentions what the cap left out only when something was', () => {
    const line = 'Older events beyond the newest 1 are left out (4).';
    const cut = renderActivityDocument([event()], { ...opts, dropped: 4 });
    expect(cut).toContain(`the same Linear account.\n\n${line}\n\n| When`);
    expect(renderActivityDocument([event()], opts)).not.toContain('Older');
  });

  it('prints the header alone without events', () => {
    const doc = renderActivityDocument([], opts);
    expect(
      doc.startsWith('Updated: 2026-10-10 20:30 · last 7 days · 0 events')
    ).toBe(true);
    expect(
      doc.endsWith('| When | Ticket | Actor | Change |\n| -- | -- | -- | -- |')
    ).toBe(true);
  });
});
