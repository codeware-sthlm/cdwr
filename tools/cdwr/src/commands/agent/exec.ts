import { isMainThread } from 'node:worker_threads';

import { defineCommand } from '../../cli/command';
import { CliError, EXIT, UsageError } from '../../cli/errors';
import { runInteractive, shellQuote } from '../../services/shell';

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
    if (!isMainThread) {
      throw new CliError(
        'The remote command needs this terminal',
        EXIT.failed,
        `Run it in a shell: cdwr agent exec --host ${host} -- ${args.join(' ')}`
      );
    }
    const argv = execArgv(host, args);
    return {
      steps: [
        {
          label: `Run ${commandOf(args)} in ${REMOTE_CONTAINER} on ${host}`,
          detail: `ssh ${argv.join(' ')}`
        }
      ],
      data: { host, args, argv }
    };
  },

  async apply(_ctx, { host, args, argv }) {
    const command = commandOf(args);
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
