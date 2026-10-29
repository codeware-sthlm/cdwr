import {
  type Reply,
  type Tokens,
  aggregate,
  costOf,
  countsDir,
  dedupeReplies,
  encodeProjectPath,
  familyBase,
  hourOf,
  hourRows,
  localDay,
  normaliseModel,
  roleOf,
  ticketOf,
  usageRows,
  wholeDaysSince,
  wholeHoursSince
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

describe('usageRows', () => {
  it('splits by day, ticket, model and role, with input as everything read', () => {
    const since = new Date('2026-10-01T00:00:00.000Z');
    const rows = usageRows(
      [
        reply({
          ticket: 'COD-1',
          tokens: tokens({ input: 1, cacheRead: 2, cacheWrite5m: 3, output: 4 })
        }),
        reply({ ticket: 'COD-1', tokens: tokens({ input: 10, output: 1 }) }),
        reply({
          ticket: 'COD-2',
          timestamp: '2026-10-07T12:00:00.000Z',
          tokens: tokens({ output: 5 })
        }),
        reply({ ticket: 'unattributed', model: 'mystery' })
      ],
      { since, host: 'mac' }
    );
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({
      day: '2026-10-06',
      ticket: 'COD-1',
      input_tokens: 16,
      output_tokens: 5,
      cache_read_tokens: 2,
      cache_write_tokens: 3,
      host: 'mac'
    });
    expect(rows[1]).toMatchObject({ ticket: 'COD-2', day: '2026-10-07' });
    expect(rows[2]).toMatchObject({
      ticket: null,
      model: 'mystery',
      cost_usd: 0
    });
  });
});

describe('wholeDaysSince', () => {
  it('starts on local midnight, so the oldest day is never partial', () => {
    const now = new Date(2026, 9, 27, 14, 0);
    const since = wholeDaysSince(now, 3);
    expect(since).toEqual(new Date(2026, 9, 24, 0, 0));
    const at = (day: number, hour: number) =>
      new Date(2026, 9, day, hour).toISOString();
    const rows = usageRows(
      [
        reply({ timestamp: at(23, 20) }),
        reply({ timestamp: at(24, 9) }),
        reply({ timestamp: at(27, 13) })
      ],
      { since, host: 'mac', dayOf: localDay }
    );
    // Oct 24 09:00 is before now-3d (14:00) yet its day is whole
    expect(rows.map((r) => r.day)).toEqual(['2026-10-24', '2026-10-27']);
  });
});

describe('usageRows other', () => {
  it('drops replies from projects outside the repo', () => {
    const rows = usageRows(
      [reply(), reply({ role: 'other', ticket: 'COD-2' })],
      { since: new Date('2026-10-01T00:00:00Z'), host: 'h' }
    );
    expect(rows.map((r) => r.ticket)).toEqual(['COD-1']);
  });
});

describe('hourOf', () => {
  it('zeroes minutes, seconds and milliseconds in UTC', () => {
    expect(hourOf('2026-10-29T23:59:59.999Z')).toBe('2026-10-29T23:00:00.000Z');
    expect(hourOf('2026-10-30T01:30:00+02:00')).toBe(
      '2026-10-29T23:00:00.000Z'
    );
  });
});

describe('wholeHoursSince', () => {
  it('floors now to the hour, then steps back', () => {
    expect(
      wholeHoursSince(new Date('2026-10-30T10:42:17.500Z'), 6).toISOString()
    ).toBe('2026-10-30T04:00:00.000Z');
  });
});

describe('hourRows', () => {
  const since = new Date('2026-10-06T10:00:00.000Z');
  const opts = { since, host: 'h' };

  it('buckets by hour, model and role and sums', () => {
    const rows = hourRows(
      [
        reply({
          timestamp: '2026-10-06T12:10:00.000Z',
          tokens: tokens({
            input: 100,
            output: 5,
            cacheRead: 10,
            cacheWrite5m: 4,
            cacheWrite1h: 1
          })
        }),
        reply({
          timestamp: '2026-10-06T12:50:00.000Z',
          tokens: tokens({ input: 200, output: 7 })
        }),
        reply({ timestamp: '2026-10-06T13:00:00.000Z', role: 'other' }),
        reply({ timestamp: '2026-10-06T12:20:00.000Z', role: 'implementing' })
      ],
      opts
    );
    expect(rows.map((r) => [r.hour, r.role])).toEqual([
      ['2026-10-06T12:00:00.000Z', 'implementing'],
      ['2026-10-06T12:00:00.000Z', 'orchestrating'],
      ['2026-10-06T13:00:00.000Z', 'other']
    ]);
    expect(rows[1]).toMatchObject({
      host: 'h',
      input_tokens: 315,
      output_tokens: 12,
      cache_read_tokens: 10,
      cache_write_tokens: 5
    });
  });

  it('costs an unpriced model at 0 and honours since', () => {
    const rows = hourRows(
      [
        reply({ model: 'mystery', tokens: tokens({ output: 9 }) }),
        reply({ timestamp: '2026-10-06T09:59:00.000Z' })
      ],
      opts
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      model: 'mystery',
      output_tokens: 9,
      cost_usd: 0
    });
  });
});
