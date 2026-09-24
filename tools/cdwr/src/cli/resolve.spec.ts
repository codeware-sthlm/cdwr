import { z } from 'zod';

import { type Answer, fakeUi } from '../testing/fake-ui';

import type { Context } from './context';
import { UsageError } from './errors';
import { input } from './inputs';
import { memoryPrefs } from './prefs';
import { publicInputs, resolveInputs } from './resolve';

const context = (
  answers: Answer[],
  opts: { interactive?: boolean; prefs?: Record<string, unknown> } = {}
) => {
  const ui = fakeUi(answers, opts.interactive ?? true);
  const ctx: Context = {
    root: '/repo',
    env: {},
    prefs: memoryPrefs(opts.prefs),
    ui,
    flags: {
      yes: false,
      dryRun: false,
      json: false,
      nonInteractive: !(opts.interactive ?? true),
      verbose: false
    },
    command: 'test'
  };
  return { ctx, ui };
};

/**
 * A prompt is the last place a bad value can be caught cheaply. An empty
 * answer used to travel on as an empty string and fail somewhere further
 * away — against a database, or as a validation error on a field nobody set.
 */
describe('an empty answer', () => {
  const ask = (spec: Parameters<typeof resolveInputs>[1]['x']) => {
    const { ctx } = context(['']);
    return resolveInputs(ctx, { x: spec }, {});
  };

  it('is refused when the input has no default', async () => {
    await expect(
      ask(input.string({ prompt: 'Which tenant?' }))
    ).rejects.toThrow('A value is required');
  });

  it('is asked for and accepted when the input is optional', async () => {
    // `default` would skip the prompt entirely; `optional` is the one that
    // still asks and lets the answer be nothing
    const { ctx, ui } = context(['']);

    await expect(
      resolveInputs(
        ctx,
        { x: input.string({ prompt: 'Which workspace?', optional: true }) },
        {}
      )
    ).resolves.toEqual({ x: '' });
    expect(ui.asked).toEqual(['Which workspace?']);
  });

  it('is accepted when a default says the input is optional', async () => {
    await expect(
      ask(input.string({ prompt: 'Slug?', default: '' }))
    ).resolves.toEqual({ x: '' });
  });

  it('is refused as a flag too, before the command does any work', async () => {
    const { ctx } = context([]);

    await expect(
      resolveInputs(
        ctx,
        { x: input.string({ prompt: 'Which tenant?' }) },
        {
          x: ''
        }
      )
    ).rejects.toThrow('--x: a value is required');
  });

  it('is refused for a secret, which has no default either', async () => {
    const { ctx } = context(['']);
    await expect(
      resolveInputs(ctx, { x: input.secret({ prompt: 'Token?' }) }, {})
    ).rejects.toThrow('A value is required');
  });
});

describe('resolveInputs', () => {
  const inputs = {
    environment: input.enum(['preview', 'production'], {
      prompt: 'Which environment?',
      remember: true
    }),
    app: input.optional(
      input.select({
        prompt: 'Which app?',
        choices: (_ctx, r) => [
          { value: `${r['environment']}-app` },
          { value: 'other' }
        ]
      }),
      (r) => r['environment'] === 'preview'
    ),
    count: input.number({ prompt: 'How many?', default: 2 }),
    token: input.secret({ prompt: 'Token?', schema: z.string().min(3) })
  };

  it('takes flags without prompting', async () => {
    const { ctx, ui } = context([]);
    const values = await resolveInputs(ctx, inputs, {
      environment: 'production',
      count: '5',
      token: 'abc'
    });
    expect(values).toEqual({
      environment: 'production',
      app: undefined,
      count: 5,
      token: 'abc'
    });
    expect(ui.asked).toEqual([]);
  });

  it('prompts for what is missing, in order, with dependent choices', async () => {
    const { ctx, ui } = context(['preview', 'preview-app', 'secret']);
    const values = await resolveInputs(ctx, inputs, {});
    expect(values).toEqual({
      environment: 'preview',
      app: 'preview-app',
      count: 2,
      token: 'secret'
    });
    expect(ui.asked).toEqual(['Which environment?', 'Which app?', 'Token?']);
  });

  it('starts a prompt on its initial value, or the remembered one', async () => {
    const spec = {
      environment: { ...inputs.environment, initial: 'preview' as const }
    };
    const { ctx, ui } = context(['production']);
    await resolveInputs(ctx, spec, {});
    expect(ui.asked).toEqual(['Which environment?']);
    const remembered = context(['production'], {
      prefs: { environment: 'production' }
    });
    await resolveInputs(remembered.ctx, spec, {});
    expect(remembered.ctx.prefs.get('environment')).toBe('production');
  });

  it('validates a select flag against the loaded choices', async () => {
    const { ctx } = context([]);
    await expect(
      resolveInputs(ctx, inputs, {
        environment: 'preview',
        app: 'nope',
        token: 'abc'
      })
    ).rejects.toThrow(/--app: 'nope' is not one of preview-app, other/);
  });

  it('rejects an enum flag outside its values', async () => {
    const { ctx } = context([]);
    await expect(
      resolveInputs(ctx, inputs, { environment: 'staging' })
    ).rejects.toThrow(UsageError);
  });

  it('runs a flag through the schema', async () => {
    const { ctx } = context([]);
    await expect(
      resolveInputs(ctx, inputs, { environment: 'production', token: 'ab' })
    ).rejects.toThrow(/--token/);
  });

  it('remembers values and offers them as the next default', async () => {
    const { ctx } = context(['production', 'x'], { prefs: {} });
    await resolveInputs(
      ctx,
      { environment: inputs.environment, token: inputs.token },
      { token: 'abc' }
    );
    expect(ctx.prefs.get('environment')).toBe('production');
    expect(ctx.prefs.get('token')).toBeUndefined();
  });

  describe('without a terminal', () => {
    it('uses defaults, treats booleans as false and optionals as absent', async () => {
      const { ctx } = context([], { interactive: false });
      const values = await resolveInputs(
        ctx,
        {
          count: inputs.count,
          force: input.boolean({ prompt: 'Force?' }),
          app: inputs.app
        },
        {}
      );
      expect(values).toEqual({ count: 2, force: false, app: undefined });
    });

    it('falls back to a boolean prompt initial value', async () => {
      const { ctx } = context([], { interactive: false });
      const values = await resolveInputs(
        ctx,
        { defer: input.boolean({ prompt: 'Defer?', initial: true }) },
        {}
      );
      expect(values).toEqual({ defer: true });
    });

    it('names the missing flag', async () => {
      const { ctx } = context([], { interactive: false });
      await expect(resolveInputs(ctx, inputs, {})).rejects.toThrow(
        /Missing --environment/
      );
    });
  });
});

describe('publicInputs', () => {
  it('drops secrets and absent values', () => {
    const inputs = {
      token: input.secret({ prompt: '' }),
      name: input.string({ prompt: '' })
    };
    expect(
      publicInputs(inputs, { token: 'x', name: 'demo', extra: undefined })
    ).toEqual({ name: 'demo' });
  });
});
