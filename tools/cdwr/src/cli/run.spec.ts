import { type Answer, fakeUi } from '../testing/fake-ui';

import { type Danger, defineCommand } from './command';
import { EXIT } from './errors';
import type { HistoryEntry } from './history';
import { input } from './inputs';
import { memoryPrefs } from './prefs';
import { runCommand } from './run';

const command = (danger: Danger, applied: string[] = []) =>
  defineCommand({
    summary: 'Test command',
    danger,
    inputs: {
      environment: input.enum(['preview', 'production'], {
        prompt: 'Which environment?'
      }),
      note: input.string({ prompt: 'Note?', default: '' })
    },
    plan: async (_ctx, inputs) => ({
      steps: ['Do the thing'],
      target: { environment: inputs.environment, name: 'demo' },
      data: { env: inputs.environment }
    }),
    apply: async (_ctx, data) => {
      applied.push(data.env);
      return { summary: `Did it on ${data.env}` };
    }
  });

const run = (
  danger: Danger,
  argv: string[],
  answers: Answer[] = [],
  interactive = true
) => {
  const applied: string[] = [];
  const history: HistoryEntry[] = [];
  const stdout: string[] = [];
  const ui = fakeUi(answers, interactive);
  const exit = runCommand({
    name: 'test run',
    command: command(danger, applied),
    argv,
    root: '/repo',
    env: {},
    prefs: memoryPrefs(),
    interactive,
    ui,
    history: (entry) => history.push(entry),
    stdout: (text) => stdout.push(text)
  });
  return { exit, applied, history, stdout, ui };
};

describe('runCommand', () => {
  it('applies a read command without confirming and records no history', async () => {
    const r = run('read', ['--environment', 'production']);
    expect(await r.exit).toBe(EXIT.ok);
    expect(r.applied).toEqual(['production']);
    expect(r.ui.asked).toEqual([]);
    expect(r.history).toEqual([]);
    expect(r.ui.printed.outro[0]).toContain('Did it on production');
  });

  it('confirms a mutating command wherever it runs', async () => {
    // It prints a plan first, and a plan reads as a question — applying one
    // unasked in development surprised someone into writing a site
    const preview = run('mutate', ['--environment', 'preview'], [true]);
    expect(await preview.exit).toBe(EXIT.ok);
    expect(preview.ui.asked).toEqual(['Continue?']);

    const production = run('mutate', ['--environment', 'production'], [true]);
    expect(await production.exit).toBe(EXIT.ok);
    expect(production.ui.asked).toEqual(['Continue on production?']);
  });

  it('applies nothing when a mutating command is declined', async () => {
    const r = run('mutate', ['--environment', 'preview'], [false]);
    expect(await r.exit).toBe(EXIT.cancelled);
    expect(r.applied).toEqual([]);
  });

  it('asks for the typed name before a destructive production change', async () => {
    const wrong = run('destructive', ['--environment', 'production'], ['nope']);
    expect(await wrong.exit).toBe(EXIT.cancelled);
    expect(wrong.applied).toEqual([]);

    const right = run('destructive', ['--environment', 'production'], ['demo']);
    expect(await right.exit).toBe(EXIT.ok);
    expect(right.ui.asked[0]).toContain('Type');
    expect(right.applied).toEqual(['production']);
  });

  it('confirms destructive changes elsewhere with a plain question', async () => {
    const r = run('destructive', ['--environment', 'preview'], [false]);
    expect(await r.exit).toBe(EXIT.cancelled);
    expect(r.ui.asked).toEqual(['This cannot be undone. Continue?']);
  });

  it('skips every confirmation with --yes', async () => {
    const r = run('destructive', ['--environment', 'production', '--yes']);
    expect(await r.exit).toBe(EXIT.ok);
    expect(r.ui.asked).toEqual([]);
  });

  it('refuses to confirm without a terminal unless --yes is given', async () => {
    const r = run('destructive', ['--environment', 'preview'], [], false);
    expect(await r.exit).toBe(EXIT.usage);
    expect(r.applied).toEqual([]);
  });

  it('never prompts for a confirmation under --non-interactive', async () => {
    const r = run(
      'destructive',
      ['--environment', 'preview', '--non-interactive'],
      [true]
    );
    expect(await r.exit).toBe(EXIT.usage);
    expect(r.ui.asked).toEqual([]);
  });

  it('stops after the plan with --dry-run', async () => {
    const r = run('destructive', ['--environment', 'production', '--dry-run']);
    expect(await r.exit).toBe(EXIT.ok);
    expect(r.applied).toEqual([]);
    expect(r.ui.printed.note[0]).toContain('Do the thing');
    expect(r.history).toEqual([]);
  });

  it('records history for anything that changes something', async () => {
    const r = run(
      'mutate',
      ['--environment', 'preview', '--note', 'hi'],
      [true]
    );
    await r.exit;
    expect(r.history).toHaveLength(1);
    expect(r.history[0]).toMatchObject({
      command: 'test run',
      inputs: { environment: 'preview', note: 'hi' },
      target: { environment: 'preview', name: 'demo' },
      outcome: 'done'
    });
  });

  it('prints one JSON document with --json', async () => {
    const r = run('read', ['--environment', 'preview', '--json'], [], false);
    expect(await r.exit).toBe(EXIT.ok);
    expect(JSON.parse(r.stdout[0] ?? '')).toEqual({
      ok: true,
      command: 'test run',
      plan: {
        steps: [{ label: 'Do the thing' }],
        target: { environment: 'preview', name: 'demo' }
      },
      result: { summary: 'Did it on preview' }
    });
  });

  it('reports a usage error as JSON too', async () => {
    const r = run('read', ['--json'], [], false);
    expect(await r.exit).toBe(EXIT.usage);
    expect(JSON.parse(r.stdout[0] ?? '')).toMatchObject({
      ok: false,
      error: { message: 'Missing --environment', exitCode: 2 }
    });
  });

  it('prints help and stops', async () => {
    const r = run('read', ['--help']);
    expect(await r.exit).toBe(EXIT.ok);
    expect(r.stdout[0]).toContain('cdwr test run');
    expect(r.stdout[0]).toContain('--environment <preview|production>');
  });

  it('ends after the plan when there is nothing to do', async () => {
    const stdout: string[] = [];
    const exit = await runCommand({
      name: 'noop',
      command: defineCommand({
        summary: '',
        danger: 'mutate',
        inputs: {},
        plan: async () => ({ steps: [], nothing: 'Already done', data: null }),
        apply: async () => {
          throw new Error('must not run');
        }
      }),
      argv: ['--json'],
      root: '/repo',
      env: {},
      prefs: memoryPrefs(),
      interactive: false,
      ui: fakeUi([], false),
      history: () => undefined,
      stdout: (t) => stdout.push(t)
    });
    expect(exit).toBe(EXIT.ok);
    expect(JSON.parse(stdout[0] ?? '')).toEqual({
      ok: true,
      command: 'noop',
      nothing: 'Already done'
    });
  });
});
