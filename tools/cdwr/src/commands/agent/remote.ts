import { z } from 'zod';

import type { Plan, Result } from '../../cli/command';
import type { Context } from '../../cli/context';
import { CliError } from '../../cli/errors';
import { input } from '../../cli/inputs';
import { CommandError, run as exec } from '../../services/shell';

import { REMOTE_CONTAINER, remoteCdwr } from './agent.logic';
import {
  type RemoteAnswer,
  parseRemoteAnswer,
  remoteLines,
  remoteSteps,
  remoteSummary,
  unreadableAnswer
} from './remote.logic';

/** The `--host` input of a command that can act on the agent container instead of locally */
export const hostInput = (description: string) =>
  input.string({
    prompt: 'Which host runs the agent container?',
    short: 'H',
    description,
    default: ''
  });

/**
 * Runs `cdwr <args>` in the agent container on `host` over ssh and reads its answer.
 * A command that fails remotely exits non-zero but still answers, so the answer counts
 * whatever ssh exited with; only no answer at all is an ssh failure.
 */
export async function sshCdwr<S extends z.ZodTypeAny>(
  host: string,
  args: string[],
  resultShape: S,
  { timeoutMs, what }: { timeoutMs: number; what: string }
): Promise<{ answer: RemoteAnswer<z.output<S>>; stdout: string }> {
  try {
    const { stdout } = await exec('ssh', remoteCdwr(host, args), {
      timeout: timeoutMs
    });
    return { answer: parseRemoteAnswer(stdout, resultShape), stdout };
  } catch (error) {
    if (!(error instanceof CommandError)) throw error;
    const answer = parseRemoteAnswer(error.stdout, resultShape);
    if (answer.kind !== 'none') return { answer, stdout: error.stdout };
    throw new CliError(
      `Could not ${what} over ssh on ${host}: ${error.stderr.trim() || error.message}`,
      undefined,
      `Check that the host is reachable and the container ${REMOTE_CONTAINER} runs`
    );
  }
}

/** A remote command: vault fetch and a quick command, without status's long check */
const REMOTE_COMMAND_TIMEOUT_MS = 60_000;

/** The command a remote plan names, and where it runs */
export interface RemoteTarget {
  host: string;
  /** The cdwr arguments, without the global flags the plan and apply add */
  args: string[];
}

const commandOf = (args: string[]) => `cdwr ${args.join(' ')}`;

async function runRemote(
  ctx: Context,
  { host, args }: RemoteTarget,
  flags: string[]
): Promise<
  Extract<RemoteAnswer<unknown>, { kind: 'result' | 'nothing' | 'plan' }>
> {
  const command = commandOf(args);
  const { answer, stdout } = await ctx.ui.task(
    `Running ${command} on ${host}`,
    () =>
      sshCdwr(host, [...args, ...flags], z.unknown(), {
        timeoutMs: REMOTE_COMMAND_TIMEOUT_MS,
        what: `run \`${command}\``
      }),
    () => `Ran ${command} on ${host}`
  );
  switch (answer.kind) {
    case 'failed':
      throw new CliError(`${host}: ${answer.message}`, undefined, answer.hint);
    case 'skew':
    case 'none':
      throw new CliError(unreadableAnswer(host, command, stdout));
    default:
      return answer;
  }
}

/** The plan of `cdwr <args>` in the agent container: its own dry run, with its steps or its nothing */
export async function remotePlan(
  ctx: Context,
  target: RemoteTarget
): Promise<Plan<{ remote: RemoteTarget }>> {
  const answer = await runRemote(ctx, target, ['--dry-run', '--json']);
  const data = { remote: target };
  switch (answer.kind) {
    case 'nothing':
      return { steps: [], nothing: `${target.host}: ${answer.nothing}`, data };
    case 'plan':
      return {
        steps: remoteSteps(target.host, answer.steps),
        notes: answer.notes,
        data
      };
    case 'result':
      // A dry run never applies; a result means the remote ignored the flag
      throw new CliError(
        `\`${commandOf(target.args)}\` on ${target.host} applied instead of planning`
      );
  }
}

/**
 * Applies `cdwr <args>` in the agent container. `--yes` because the local run has
 * already confirmed; `fallback` is the summary of a result that carries none.
 */
export async function remoteApply(
  ctx: Context,
  target: RemoteTarget,
  fallback: string
): Promise<Result> {
  const answer = await runRemote(ctx, target, ['--yes', '--json']);
  switch (answer.kind) {
    case 'nothing':
      return { summary: `${target.host}: ${answer.nothing}` };
    case 'plan':
      throw new CliError(
        `\`${commandOf(target.args)}\` on ${target.host} planned instead of applying`
      );
    case 'result':
      return {
        summary: `${target.host}: ${remoteSummary(answer.result, fallback)}`,
        details: remoteLines(answer.result, 'details'),
        next: remoteLines(answer.result, 'next'),
        json: answer.result,
        partial: !answer.ok
      };
  }
}
