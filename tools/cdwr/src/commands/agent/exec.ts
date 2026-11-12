import { isMainThread } from 'node:worker_threads';

import { type AnyCommand, defineCommand } from '../../cli/command';
import { CliError, EXIT, UsageError } from '../../cli/errors';
import { type Inputs, flagOf } from '../../cli/inputs';
import { lookup } from '../../cli/registry';
import { runInteractive, shellQuote } from '../../services/shell';
import { ENTRIES, GROUPS } from '../index';

import { REMOTE_CONTAINER, remoteCdwr } from './agent.logic';
import { hostInput } from './remote';

/** ssh exits 255 when it never reached the host, whatever the remote would have said */
const SSH_FAILED = 255;

/**
 * ssh's arguments for `cdwr <args>` in the agent container. ssh joins its arguments
 * into one line for the remote shell, so each argument is quoted: it reaches `cdwr`
 * as given and never runs as a command of its own.
 */
export const execArgv = (host: string, args: string[]): string[] =>
  remoteCdwr(host, args.map(shellQuote));

const commandOf = (args: string[]) => `cdwr ${args.join(' ')}`;

const HIDDEN = '***';

/**
 * The args as the plan, the summary and the errors show them: the value given to a
 * secret input of the remote command is hidden, as the command itself would hide it
 */
export const shownArgs = (args: string[], command?: AnyCommand): string[] => {
  const secret = new Set<string>();
  const inputs: Inputs = command?.inputs ?? {};
  for (const [key, spec] of Object.entries(inputs)) {
    if (spec.kind !== 'secret') continue;
    secret.add(`--${flagOf(key, spec)}`);
    if (spec.short) secret.add(`-${spec.short}`);
  }
  if (secret.size === 0) return args;
  let hideNext = false;
  return args.map((arg) => {
    if (hideNext) {
      hideNext = false;
      return HIDDEN;
    }
    const eq = arg.indexOf('=');
    if (arg.startsWith('--') && eq !== -1 && secret.has(arg.slice(0, eq))) {
      return `${arg.slice(0, eq)}=${HIDDEN}`;
    }
    if (secret.has(arg)) {
      hideNext = true;
      return arg;
    }
    // A short flag with its value attached, such as -pvalue
    const short = arg.slice(0, 2);
    if (!arg.startsWith('--') && arg.length > 2 && secret.has(short)) {
      return `${short}${HIDDEN}`;
    }
    return arg;
  });
};

/** The remote command's definition, to know which of its inputs are secret */
const remoteCommand = async (
  args: string[]
): Promise<AnyCommand | undefined> => {
  const found = lookup(args, GROUPS, ENTRIES);
  return found.kind === 'command' ? found.entry.load() : undefined;
};

export default defineCommand({
  summary: 'Run a cdwr command in the agent container, with its vault secrets',
  description:
    "Runs `cdwr <args>` in the agent container on --host over ssh, through the entrypoint's secrets.sh, so the command gets the same vault keys as the scheduler loop; a plain `docker exec` gets none. Only cdwr runs, never another command. The output streams here and the remote's exit code is this command's. The remote has no terminal and never prompts: pass its inputs as flags, --yes included. Global flags before -- apply here (-d prints the ssh line and stops); after it they go to the remote command.",
  danger: 'mutate',
  confirm: 'never',
  rest: true,
  inputs: {
    host: hostInput('The host whose agent container runs the command')
  },

  async plan(ctx, { host }) {
    const args = ctx.rest ?? [];
    if (!host) {
      throw new UsageError(
        'Missing --host',
        'Name the host that runs the agent container, such as --host agent-host'
      );
    }
    if (host.startsWith('-')) {
      throw new UsageError(`'${host}' is not a host name`);
    }
    if (args.length === 0) {
      throw new UsageError(
        'Nothing to run',
        'Give the cdwr command after --, such as -- agent status'
      );
    }
    if (ctx.flags.json) {
      throw new UsageError(
        'The output streams as the remote command writes it',
        'Put --json after -- to have the remote command answer in JSON'
      );
    }
    const shown = shownArgs(args, await remoteCommand(args));
    if (!isMainThread) {
      throw new CliError(
        'The remote command needs this terminal',
        EXIT.failed,
        `Run it in a shell: cdwr agent exec --host ${host} -- ${shown.join(' ')}`
      );
    }
    return {
      steps: [
        {
          label: `Run ${commandOf(shown)} in ${REMOTE_CONTAINER} on ${host}`,
          detail: `ssh ${execArgv(host, shown).join(' ')}`
        }
      ],
      data: { host, shown, argv: execArgv(host, args) }
    };
  },

  async apply(_ctx, { host, shown, argv }) {
    const command = commandOf(shown);
    const code = await runInteractive('ssh', argv);
    if (code === 0) return { summary: `${command} on ${host} finished` };
    if (code === SSH_FAILED) {
      throw new CliError(
        `Could not run ${command} over ssh on ${host}`,
        code,
        `Check that the host is reachable and the container ${REMOTE_CONTAINER} runs`
      );
    }
    throw new CliError(
      code === null
        ? `${command} on ${host} was stopped by a signal`
        : `${command} on ${host} exited with ${code}`,
      code ?? EXIT.failed
    );
  }
});
