import { createSilentUi } from '../ui/silent';
import { createTerminalUi } from '../ui/terminal';
import { symbols, theme } from '../ui/theme';
import type { Ui } from '../ui/ui';

import { parseCommandArgs } from './args';
import { type AnyCommand, type Plan, confirmFor } from './command';
import type { Context, Flags } from './context';
import { Cancelled, CliError, EXIT, UsageError, messageOf } from './errors';
import { renderCommandHelp } from './help';
import { type HistoryEntry, recordHistory } from './history';
import { preflight } from './preflight';
import type { Prefs } from './prefs';
import { publicInputs, resolveInputs } from './resolve';

export interface RunOptions {
  /** Space-joined command path, such as `db backup` */
  name: string;
  command: AnyCommand;
  argv: string[];
  root: string;
  env: NodeJS.ProcessEnv;
  prefs: Prefs;
  /** stdout is a terminal */
  interactive: boolean;
  /** Overrides for tests */
  ui?: Ui;
  history?: (entry: HistoryEntry) => void;
  stdout?: (text: string) => void;
}

const stepLines = (plan: Plan): string[] =>
  plan.steps.map((step, i) => {
    const { label, detail } = typeof step === 'string' ? { label: step } : step;
    const n = theme.muted(`${String(i + 1).padStart(2)}.`);
    return detail
      ? `${n} ${label}\n    ${theme.muted(detail)}`
      : `${n} ${label}`;
  });

async function confirmPlan(
  ctx: Context,
  command: AnyCommand,
  plan: Plan
): Promise<void> {
  const mode = confirmFor(command.danger, command.confirm);
  const production = plan.target?.environment === 'production';
  const needed = mode === 'always' || (mode === 'production' && production);
  if (!needed || ctx.flags.yes) return;

  if (!ctx.ui.interactive || ctx.flags.nonInteractive) {
    throw new UsageError(
      'This command needs a confirmation',
      'Pass --yes to confirm it up front'
    );
  }

  if (command.danger === 'destructive' && production) {
    const name = plan.target?.name ?? 'production';
    const typed = await ctx.ui.text({
      message: `${symbols.warn} Type ${theme.danger(name)} to continue`,
      placeholder: name
    });
    if (typed.trim() !== name) throw new Cancelled('Name did not match');
    return;
  }

  const label =
    command.danger === 'spends-money'
      ? 'This spends money. Continue?'
      : command.danger === 'destructive'
        ? 'This cannot be undone. Continue?'
        : `Continue${production ? ' on production' : ''}?`;
  if (!(await ctx.ui.confirm({ message: label }))) throw new Cancelled();
}

/** Run one command through the lifecycle and return its exit code */
export async function runCommand(options: RunOptions): Promise<number> {
  const { name, command, argv, root, env, prefs } = options;
  const stdout =
    options.stdout ?? ((text: string) => process.stdout.write(`${text}\n`));

  let parsed;
  try {
    parsed = parseCommandArgs(argv, command.inputs);
  } catch (error) {
    return fail(error, false, stdout);
  }
  if (parsed.globals.help) {
    stdout(renderCommandHelp(name, command));
    return EXIT.ok;
  }

  const flags: Flags = {
    yes: parsed.globals.yes,
    dryRun: parsed.globals['dry-run'],
    json: parsed.globals.json,
    nonInteractive:
      parsed.globals['non-interactive'] ||
      parsed.globals.json ||
      !options.interactive,
    verbose: parsed.globals.verbose
  };
  const ui =
    options.ui ??
    (flags.json
      ? createSilentUi((line) => process.stderr.write(`${line}\n`))
      : createTerminalUi());
  const ctx: Context = { root, env, prefs, ui, flags, command: name };
  const record = options.history ?? recordHistory;
  const started = Date.now();
  let inputs: Record<string, unknown> = {};
  let plan: Plan | undefined;

  try {
    ui.intro(`cdwr ${name}`);
    preflight(command.needs, env);
    inputs = await resolveInputs(ctx, command.inputs, parsed.values);
    plan = await command.plan(ctx, inputs);

    if (plan.nothing) {
      ui.outro(`${symbols.ok} ${plan.nothing}`);
      if (flags.json)
        stdout(
          JSON.stringify({ ok: true, command: name, nothing: plan.nothing })
        );
      return EXIT.ok;
    }
    if (plan.steps.length > 0) ui.note(stepLines(plan), 'Plan');
    for (const note of plan.notes ?? []) ui.warn(note);

    if (flags.dryRun) {
      ui.outro(`${symbols.info} Dry run, nothing applied`);
      if (flags.json)
        stdout(
          JSON.stringify({
            ok: true,
            command: name,
            dryRun: true,
            plan: planJson(plan)
          })
        );
      return EXIT.ok;
    }

    await confirmPlan(ctx, command, plan);
    const result = await command.apply(ctx, plan.data, inputs);
    prefs.save();

    if (command.danger !== 'read') {
      record({
        at: new Date(started).toISOString(),
        command: name,
        inputs: publicInputs(command.inputs, inputs),
        target: plan.target,
        outcome: result.partial ? 'partial' : 'done',
        summary: result.summary,
        took: Date.now() - started
      });
    }

    if (flags.json) {
      stdout(
        JSON.stringify({
          ok: !result.partial,
          command: name,
          plan: planJson(plan),
          result: result.json ?? {
            summary: result.summary,
            details: result.details,
            next: result.next
          }
        })
      );
    } else {
      for (const line of result.details ?? []) ui.info(line);
      if (result.next?.length)
        ui.note(
          result.next.map((n) => `${symbols.bullet} ${n}`),
          'Still needs you'
        );
      const took = theme.muted(
        `${((Date.now() - started) / 1000).toFixed(1)}s`
      );
      ui.outro(
        `${result.partial ? symbols.warn : symbols.ok} ${result.summary} ${took}`
      );
    }
    return result.partial ? EXIT.failed : EXIT.ok;
  } catch (error) {
    if (plan && command.danger !== 'read' && !(error instanceof Cancelled)) {
      record({
        at: new Date(started).toISOString(),
        command: name,
        inputs: publicInputs(command.inputs, inputs),
        target: plan.target,
        outcome: 'failed',
        summary: messageOf(error),
        took: Date.now() - started
      });
    }
    prefs.save();
    return fail(error, flags.json, stdout, flags.verbose);
  }
}

const planJson = (plan: Plan) => ({
  steps: plan.steps.map((s) => (typeof s === 'string' ? { label: s } : s)),
  notes: plan.notes,
  target: plan.target
});

/** Print an error the way the mode wants and return its exit code */
export function fail(
  error: unknown,
  json: boolean,
  stdout: (text: string) => void,
  verbose = false
): number {
  const known = error instanceof CliError;
  const code = known ? error.exitCode : EXIT.failed;
  const message = messageOf(error);
  const hint = known ? error.hint : undefined;

  if (json) {
    stdout(
      JSON.stringify({ ok: false, error: { message, hint, exitCode: code } })
    );
    return code;
  }
  if (error instanceof Cancelled) {
    process.stderr.write(`${theme.muted(message)}\n`);
    return code;
  }
  process.stderr.write(`${symbols.fail} ${message}\n`);
  if (hint) process.stderr.write(`  ${theme.muted(hint)}\n`);
  if (!known && verbose && error instanceof Error && error.stack) {
    process.stderr.write(`${theme.muted(error.stack)}\n`);
  }
  return code;
}
