import {
  type FlyApp,
  NO_PREVIEW_ACCESS,
  type PreviousSweep,
  SWEEP_RULES,
  type SweepContext,
  runSweep
} from './sweep.rules';

const TODAY = '2026-11-26';

function context(over: Partial<SweepContext> = {}): SweepContext {
  return {
    apps: async () => [],
    pullRequest: async () => null,
    ledger: async () => null,
    previous: async () => null,
    ...over
  };
}

const app = (name: string, status = 'deployed'): FlyApp => ({ name, status });

const rule = (id: string) => {
  const found = SWEEP_RULES.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`no rule ${id}`);
  return found;
};

describe('sweep rules', () => {
  describe('orphan-app', () => {
    it('finds a preview app whose pull request is closed', async () => {
      const result = await runSweep(
        context({
          apps: async () => [app('cdwr-cms-pr-737')],
          pullRequest: async () => 'closed'
        }),
        [rule('orphan-app')]
      );
      expect(result.unchecked).toEqual([]);
      expect(result.findings).toEqual([
        expect.objectContaining({
          key: 'orphan-app:cdwr-cms-pr-737',
          rule: 'orphan-app',
          subject: 'cdwr-cms-pr-737',
          fix: 'fly apps destroy cdwr-cms-pr-737 --yes'
        })
      ]);
    });

    it('finds a tenant preview app of a closed pull request', async () => {
      const pullRequest = vi.fn(async () => 'closed' as const);
      const result = await runSweep(
        context({
          apps: async () => [app('cdwr-cms-pr-12-moon')],
          pullRequest
        }),
        [rule('orphan-app')]
      );
      expect(pullRequest).toHaveBeenCalledWith(12);
      expect(result.findings.map(({ key }) => key)).toEqual([
        'orphan-app:cdwr-cms-pr-12-moon'
      ]);
    });

    it('is no finding when the pull request is open', async () => {
      const result = await runSweep(
        context({
          apps: async () => [app('cdwr-cms-pr-737')],
          pullRequest: async () => 'open'
        }),
        [rule('orphan-app')]
      );
      expect(result).toEqual({ findings: [], unchecked: [] });
    });

    it('is unchecked, with no finding, when a pull request state is unknown', async () => {
      const result = await runSweep(
        context({
          apps: async () => [
            app('cdwr-cms-pr-5'),
            app('cdwr-cms-pr-737'),
            app('cdwr-cms-pr-737-moon')
          ],
          pullRequest: async (pr) => (pr === 5 ? 'closed' : null)
        }),
        [rule('orphan-app')]
      );
      expect(result).toEqual({
        findings: [],
        unchecked: [
          { rule: 'orphan-app', reason: 'the state of PR 737 is unknown' }
        ]
      });
    });

    it('never asks about production or foreign apps', async () => {
      const pullRequest = vi.fn(async () => 'closed' as const);
      const result = await runSweep(
        context({
          apps: async () => [app('cdwr-cms'), app('other-pr-5')],
          pullRequest
        }),
        [rule('orphan-app')]
      );
      expect(pullRequest).not.toHaveBeenCalled();
      expect(result).toEqual({ findings: [], unchecked: [] });
    });
  });

  describe('pg-preview rules', () => {
    it.each(['orphan-database', 'orphan-role', 'preview-volume'])(
      '%s is always unchecked',
      async (id) => {
        const result = await runSweep(context(), [rule(id)]);
        expect(result).toEqual({
          findings: [],
          unchecked: [{ rule: id, reason: NO_PREVIEW_ACCESS }]
        });
        expect(NO_PREVIEW_ACCESS).toBe('no pg-preview access');
      }
    );
  });

  describe('pending-app', () => {
    const previous = (apps: Record<string, string>): PreviousSweep => ({
      apps,
      known: []
    });

    it('finds an app pending now and in the previous sweep', async () => {
      const result = await runSweep(
        context({
          apps: async () => [app('cdwr-cms-pr-1', 'pending')],
          previous: async () => previous({ 'cdwr-cms-pr-1': 'pending' })
        }),
        [rule('pending-app')]
      );
      expect(result.findings).toEqual([
        expect.objectContaining({
          key: 'pending-app:cdwr-cms-pr-1',
          fix: 'fly status --app cdwr-cms-pr-1'
        })
      ]);
    });

    it('is no finding when it was not pending before', async () => {
      const result = await runSweep(
        context({
          apps: async () => [app('cdwr-cms-pr-1', 'pending')],
          previous: async () => previous({ 'cdwr-cms-pr-1': 'deployed' })
        }),
        [rule('pending-app')]
      );
      expect(result.findings).toEqual([]);
    });

    it('is no finding without a previous sweep', async () => {
      const result = await runSweep(
        context({ apps: async () => [app('cdwr-cms-pr-1', 'pending')] }),
        [rule('pending-app')]
      );
      expect(result).toEqual({ findings: [], unchecked: [] });
    });
  });

  describe('spend-ledger', () => {
    const check = async (lines: string[] | null) =>
      (
        await runSweep(context({ ledger: async () => lines }), [
          rule('spend-ledger')
        ])
      ).findings;

    it('is no finding without a ledger', async () => {
      expect(await check(null)).toEqual([]);
    });

    it('accepts valid lines, a negative cost and blank lines', async () => {
      expect(
        await check([
          JSON.stringify({ day: TODAY, cost: 1.5 }),
          '',
          '   ',
          JSON.stringify({ day: TODAY, cost: -2 }),
          JSON.stringify({ day: '2026-11-25', cost: 3 })
        ])
      ).toEqual([]);
    });

    it('finds a line that is not JSON, numbered from 1', async () => {
      const found = await check([
        JSON.stringify({ day: TODAY, cost: 1 }),
        'not json'
      ]);
      expect(found).toEqual([
        expect.objectContaining({
          key: 'spend-ledger:line-2',
          subject: 'line-2'
        })
      ]);
    });

    it('finds JSON that is not an object, an array included', async () => {
      const found = await check(['5', '[1,2]']);
      expect(found.map(({ subject }) => subject)).toEqual(['line-1', 'line-2']);
    });

    it('finds a cost that is not a number on any day, a missing one included', async () => {
      const found = await check([
        JSON.stringify({ day: TODAY, cost: '1.5' }),
        JSON.stringify({ day: '2026-11-25', cost: '1.5' }),
        JSON.stringify({ day: TODAY, kind: 'reserve' }),
        JSON.stringify({ day: TODAY, cost: null }),
        JSON.stringify({ day: TODAY, cost: 2 })
      ]);
      expect(found.map(({ subject }) => subject)).toEqual([
        'line-1',
        'line-2',
        'line-3',
        'line-4'
      ]);
    });
  });

  describe('runSweep', () => {
    it('makes the rules of a failing reader unchecked and runs the others', async () => {
      const result = await runSweep(
        context({
          apps: async () => {
            throw new Error('fly is down\nsecond line');
          },
          ledger: async () => ['nope']
        })
      );
      expect(result.unchecked).toEqual(
        expect.arrayContaining([
          { rule: 'orphan-app', reason: 'fly is down' },
          { rule: 'pending-app', reason: 'fly is down' }
        ])
      );
      expect(result.unchecked.map(({ rule }) => rule)).toEqual([
        'orphan-app',
        'orphan-database',
        'orphan-role',
        'preview-volume',
        'pending-app'
      ]);
      // spend-ledger still ran
      expect(result.findings.map(({ key }) => key)).toEqual([
        'spend-ledger:line-1'
      ]);
    });
  });
});
