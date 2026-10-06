import {
  type Reply,
  type Tokens,
  aggregate,
  costOf,
  countsDir,
  dedupeReplies,
  encodeProjectPath,
  familyBase,
  normaliseModel,
  renderUsageDocument,
  roleOf,
  ticketOf
} from './usage.logic';

const tokens = (over: Partial<Tokens> = {}): Tokens => ({
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite5m: 0,
  cacheWrite1h: 0,
  ...over
});

const reply = (over: Partial<Reply> = {}): Reply => ({
  timestamp: '2026-10-06T12:00:00.000Z',
  role: 'orchestrating',
  ticket: 'COD-1',
  model: 'claude-opus-5',
  tokens: tokens({ output: 1_000_000 }),
  ...over
});

describe('encodeProjectPath', () => {
  it.each([
    ['/x/codeware', '-x-codeware'],
    ['/Users/a.b/my_repo', '-Users-a-b-my-repo']
  ])('%s → %s', (path, expected) => {
    expect(encodeProjectPath(path)).toBe(expected);
  });
});

describe('familyBase', () => {
  it.each([
    ['/x/codeware-cod-533', '/x/codeware'],
    ['/x/codeware', '/x/codeware']
  ])('%s → %s', (root, expected) => {
    expect(familyBase(root)).toBe(expected);
  });
});

describe('countsDir', () => {
  it.each([
    ['-x-codeware', true],
    ['-x-codeware-agent', true],
    ['-x-codeware-cod-533', true],
    ['-x-codewarex', false],
    ['-private-tmp-claude-x-codeware-dev-scratchpad', false],
    ['-x-other', false]
  ])('%s → %s', (dir, expected) => {
    expect(countsDir(dir, '/x/codeware')).toBe(expected);
  });
});

describe('roleOf', () => {
  it.each([
    ['-x-codeware-agent', false, 'planning'],
    ['-x-codeware-agent', true, 'planning'],
    ['-x-codeware-cod-533', true, 'implementing'],
    ['-x-codeware-cod-533', false, 'orchestrating'],
    ['-x-codeware', false, 'orchestrating']
  ])('%s subagent=%s → %s', (dirName, subagent, expected) => {
    expect(roleOf({ dirName, base: '/x/codeware', subagent })).toBe(expected);
  });
});

describe('ticketOf', () => {
  it.each([
    ['cod-532-usage-command', 'COD-532'],
    ['COD-7', 'COD-7'],
    ['main', 'unattributed'],
    [undefined, 'unattributed'],
    ['feat/cod-5', 'unattributed']
  ])('%s → %s', (branch, expected) => {
    expect(ticketOf(branch)).toBe(expected);
  });
});

describe('normaliseModel', () => {
  it.each([
    ['claude-haiku-4-5-20251001', 'claude-haiku-4-5'],
    ['claude-opus-5-5', 'claude-opus-5-5']
  ])('%s → %s', (id, expected) => {
    expect(normaliseModel(id)).toBe(expected);
  });
});

describe('dedupeReplies', () => {
  it('keeps the record with the most output per message id', () => {
    const records = [1, 700, 12].map((output) => ({ id: 'm1', output }));
    expect(dedupeReplies(records)).toEqual([{ id: 'm1', output: 700 }]);
  });

  it('falls back to requestId and keeps records with neither', () => {
    const out = dedupeReplies([
      { requestId: 'r1', output: 5 },
      { requestId: 'r1', output: 9 },
      { output: 1 },
      { output: 1 }
    ]);
    expect(out).toHaveLength(3);
    expect(out).toContainEqual({ requestId: 'r1', output: 9 });
  });
});

describe('costOf', () => {
  it('prices input, output and cache reads per million', () => {
    // Opus 5: 5 + 25 + 0.5
    expect(
      costOf(
        'claude-opus-5',
        tokens({ input: 1e6, output: 1e6, cacheRead: 1e6 })
      )
    ).toBeCloseTo(30.5);
  });

  it('prices 5m cache writes at 1.25x input', () => {
    expect(costOf('claude-opus-5', tokens({ cacheWrite5m: 1e6 }))).toBeCloseTo(
      6.25
    );
  });

  it('prices 1h cache writes at 2x input', () => {
    expect(costOf('claude-opus-5', tokens({ cacheWrite1h: 1e6 }))).toBeCloseTo(
      10
    );
  });

  it('doubles every rate in fast mode', () => {
    expect(
      costOf('claude-opus-5', tokens({ output: 1e6 }), 'fast')
    ).toBeCloseTo(50);
  });

  it('never guesses an unknown model', () => {
    expect(costOf('claude-mystery', tokens({ output: 1 }))).toBeUndefined();
  });
});

describe('aggregate', () => {
  const since = new Date('2026-10-01T00:00:00Z');

  it('drops replies before since and groups by day, role and model', () => {
    const result = aggregate(
      [
        reply({ timestamp: '2026-09-30T23:59:59Z' }),
        reply({ timestamp: '2026-10-06T01:00:00Z', role: 'planning' }),
        reply({ timestamp: '2026-10-05T01:00:00Z' }),
        reply({ timestamp: '2026-10-05T02:00:00Z' })
      ],
      { since }
    );
    expect(result.days.map((d) => [d.day, d.role, d.cost])).toEqual([
      ['2026-10-05', 'orchestrating', 50],
      ['2026-10-06', 'planning', 25]
    ]);
    expect(result.totals.cost).toBe(75);
  });

  it('groups by ticket, then role and model', () => {
    const result = aggregate(
      [
        reply({ ticket: 'COD-2' }),
        reply({ ticket: 'COD-1', role: 'implementing' }),
        reply({ ticket: 'COD-1' })
      ],
      { since }
    );
    expect(result.tickets.map((t) => [t.ticket, t.role])).toEqual([
      ['COD-1', 'implementing'],
      ['COD-1', 'orchestrating'],
      ['COD-2', 'orchestrating']
    ]);
  });

  it('counts tokens of an unpriced model but not its cost, and flags it', () => {
    const result = aggregate(
      [
        reply(),
        reply({ model: 'claude-mystery', tokens: tokens({ output: 7 }) })
      ],
      { since }
    );
    const row = result.days.find((d) => d.model === 'claude-mystery');
    expect(row).toMatchObject({ tokens: tokens({ output: 7 }), cost: null });
    expect(result.totals).toMatchObject({
      cost: 25,
      tokens: tokens({ output: 1_000_007 }),
      unpricedModels: ['claude-mystery']
    });
  });

  it('applies the fast factor and rounds to cents only at the end', () => {
    const small = tokens({ output: 1000 }); // 0.025 each
    const result = aggregate(
      [
        reply({ tokens: small }),
        reply({ tokens: small }),
        reply({ tokens: small, speed: 'fast' })
      ],
      { since }
    );
    // 0.025 + 0.025 + 0.05 = 0.10, not 0.03 + 0.03 + 0.05
    expect(result.totals.cost).toBe(0.1);
  });
});

describe('aggregate dayOf', () => {
  it('groups days by the given function, UTC by default', () => {
    const since = new Date('2026-10-01T00:00:00.000Z');
    const late = [reply({ timestamp: '2026-10-06T23:30:00.000Z' })];
    expect(aggregate(late, { since }).days[0].day).toBe('2026-10-06');
    expect(
      aggregate(late, { since, dayOf: () => '2026-10-07' }).days[0].day
    ).toBe('2026-10-07');
  });
});

describe('renderUsageDocument', () => {
  const since = new Date('2026-10-01T00:00:00.000Z');
  const result = aggregate(
    [
      reply({ ticket: 'COD-2', role: 'planning' }), // 25
      reply({
        ticket: 'COD-2',
        role: 'implementing',
        model: 'claude-sonnet-5'
      }), // 10
      reply({ ticket: 'unattributed', timestamp: '2026-10-05T12:00:00.000Z' }), // 25, older day
      reply({
        ticket: 'COD-1',
        tokens: tokens({ output: 2_000_000, cacheRead: 3 })
      }) // 50
    ],
    { since }
  );
  const doc = renderUsageDocument(result, {
    updated: '2026-10-07 00:13',
    windowDays: 30
  });

  it('starts with the lines the Desk reads', () => {
    expect(doc.split('\n\n').slice(0, 2)).toEqual([
      'Updated: 2026-10-07 00:13 · last 30 days · 110.00 USD',
      'Prices: 2026-09-25'
    ]);
  });

  it('writes one daily row per day, by role', () => {
    expect(doc).toContain(
      '| Day | Planning | Orchestrating | Implementing | Total |'
    );
    expect(doc).toContain('| 2026-10-05 | 0.00 | 25.00 | 0.00 | 25.00 |');
    expect(doc).toContain('| 2026-10-06 | 25.00 | 50.00 | 10.00 | 85.00 |');
  });

  it('lists tickets by cost, unattributed last', () => {
    const tickets = doc
      .split('## Tickets')[1]
      .split('\n')
      .filter((line) => /^\| (COD|unattributed)/.test(line));
    expect(tickets).toEqual([
      '| COD-1 | 0.00 | 50.00 | 0.00 | 50.00 | 2000000 | 3 |',
      '| COD-2 | 25.00 | 0.00 | 10.00 | 35.00 | 2000000 | 0 |',
      '| unattributed | 0.00 | 25.00 | 0.00 | 25.00 | 1000000 | 0 |'
    ]);
  });

  it('shows an unpriced cost as ? and names the model', () => {
    const unpriced = renderUsageDocument(
      aggregate([reply({ model: 'claude-mystery' })], { since }),
      { updated: 'x', windowDays: 1 }
    );
    expect(unpriced).toContain(
      'Prices: 2026-09-25 · not priced: claude-mystery'
    );
    expect(unpriced).toContain('| claude-mystery | 0 | 1000000 | 0 | 0 | ? |');
  });
});
