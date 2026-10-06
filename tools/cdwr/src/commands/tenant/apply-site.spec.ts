import type { Context } from '../../cli/context';
import { memoryPrefs } from '../../cli/prefs';
import { resolveInputs } from '../../cli/resolve';
import { fakeUi } from '../../testing/fake-ui';

import command from './apply-site';

const resolveFresh = (values: Record<string, string | boolean>) => {
  const ui = fakeUi([], true);
  const ctx: Context = {
    root: '/repo',
    env: {},
    prefs: memoryPrefs(),
    ui,
    flags: {
      yes: false,
      dryRun: false,
      json: false,
      nonInteractive: false,
      verbose: false
    },
    command: 'tenant apply-site'
  };
  const { environment, fresh } = command.inputs;
  return {
    ui,
    result: resolveInputs(ctx, { environment, fresh }, values)
  };
};

describe('apply-site --fresh', () => {
  it('is taken on production rather than refused', async () => {
    await expect(
      resolveFresh({ environment: 'production', fresh: true }).result
    ).resolves.toEqual({ environment: 'production', fresh: true });
  });

  it('is never asked outside development, so a live site is only replaced on purpose', async () => {
    const { ui, result } = resolveFresh({ environment: 'preview' });

    await expect(result).resolves.toEqual({
      environment: 'preview',
      fresh: false
    });
    expect(ui.asked).toEqual([]);
  });
});
