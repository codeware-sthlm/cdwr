import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { defineCommand, readOnly } from '../../cli/command';
import type { Context } from '../../cli/context';
import { CliError } from '../../cli/errors';
import { input } from '../../cli/inputs';
import {
  checkRun,
  implementReport,
  jobState,
  keyPresent,
  lockAge,
  paths,
  readQueueSources,
  readText,
  requireHost,
  worktreeOf
} from '../../services/agent-queue';
import { CommandError, run as exec } from '../../services/shell';
import { symbols, theme } from '../../ui/theme';

import {
  IMPLEMENT_BUDGET_USD,
  KEYCHAIN_SERVICE,
  LINEAR_KEY_ENV,
  REMOTE_CONTAINER,
  RUN_FALLBACK_SECONDS,
  RUN_INTERVAL_SECONDS,
  byFile,
  filesDrift,
  formatHeld,
  formatImplement,
  formatNext,
  formatParked,
  formatTable,
  formatWatching,
  lastSchedulerLine,
  linearKeySource,
  lockState,
  parseAttended,
  parseCheck,
  parseLinear,
  parseNotifyLevel,
  parseQueueView,
  parseSuggest,
  parseWatchState,
  summarizeSchedulerLine
} from './agent.logic';
import {
  type RemoteReport,
  formatContainerJob,
  parseListener,
  parseRemoteStatus,
  remoteStatus,
  rmLockCommand,
  skewedStatus,
  staleScriptsHint,
  unreadableStatus
} from './status.logic';

export default defineCommand({
  summary:
    'Whether the scheduled planner is loaded, healthy and what it would take next',
  description:
    'Reads the launchd job, the pause flag, the Keychain item, the installed script, the worktree and the logs. Nothing is changed and no secret is read.',
  danger: 'read',
  inputs: {
    host: input.string({
      prompt: 'Which host runs the agent container?',
      short: 'H',
      description:
        'Read the status of the queue in the agent container over ssh on this host instead of locally',
      default: ''
    })
  },

  async plan(ctx, { host: sshHost }) {
    if (sshHost) {
      const remote = await ctx.ui.task(
        `Reading the agent queue on ${sshHost}`,
        () => remoteReport(sshHost),
        () => `Read the agent queue on ${sshHost}`
      );
      return readOnly(remote);
    }
    return readOnly(await localReport(ctx));
  },

  async apply(ctx, report, { host: sshHost }) {
    const { job } = report;
    const containerJob = formatContainerJob(
      report.listener,
      new Date(),
      RUN_INTERVAL_SECONDS / 60,
      RUN_FALLBACK_SECONDS / 60
    );
    const row = (ok: boolean | 'warn', check: string, detail: string) => [
      ok === 'warn' ? symbols.warn : ok ? symbols.ok : symbols.fail,
      check,
      ok === true ? theme.muted(detail) : theme.warn(detail)
    ];

    // The loaded job's interval when it differs from what install writes
    const staleInterval =
      job.loaded && job.intervalSeconds !== RUN_INTERVAL_SECONDS
        ? job.intervalSeconds
        : undefined;

    const rows = [
      report.host === 'container'
        ? row(containerJob.ok, 'job', containerJob.detail)
        : job.loaded
          ? row(
              (job.lastExitCode === undefined || job.lastExitCode === 0) &&
                staleInterval === undefined
                ? true
                : 'warn',
              'job',
              [
                job.running ? 'running' : 'loaded',
                job.runs === undefined ? undefined : `${job.runs} run(s)`,
                job.lastExitCode === undefined
                  ? undefined
                  : `last exit ${job.lastExitCode}`,
                staleInterval === undefined
                  ? undefined
                  : `every ${staleInterval} s; re-run \`cdwr agent install\``
              ]
                .filter(Boolean)
                .join(', ')
            )
          : row(false, 'job', 'not loaded; `cdwr agent install`'),
      report.paused
        ? row('warn', 'paused', 'yes; `cdwr agent resume`')
        : row(true, 'paused', 'no'),
      row(
        true,
        'notify',
        report.notifyLevel === 'action'
          ? 'action (only what needs you)'
          : report.notifyLevel
      ),
      report.keyPresent
        ? row(
            true,
            'Linear key',
            report.keySource === 'env'
              ? `from ${LINEAR_KEY_ENV}`
              : 'in the Keychain'
          )
        : row(
            false,
            'Linear key',
            report.host === 'container'
              ? `not set (${LINEAR_KEY_ENV})`
              : `not set (the Keychain service ${KEYCHAIN_SERVICE})`
          ),
      ...(report.mirror === null
        ? []
        : [row(true, 'Heartbeat mirror', report.mirror)]),
      report.script === 'current'
        ? row(true, 'scripts', 'current')
        : report.script === 'stale' ||
            (report.script === 'missing' && report.installedAny)
          ? row('warn', 'scripts', staleScriptsHint(report.host))
          : row(
              false,
              'scripts',
              report.script === 'no-source'
                ? 'repo source missing'
                : 'not installed; `cdwr agent install`'
            ),
      report.worktree.exists
        ? row(true, 'worktree', report.worktree.path)
        : row(false, 'worktree', `${report.worktree.path} does not exist`),
      report.lastScheduled
        ? row(
            true,
            'last run',
            `${report.lastScheduled.at} ${summarizeSchedulerLine(report.lastScheduled.message)}`
          )
        : row('warn', 'last run', 'nothing logged yet'),
      ...(report.watching.length > 0
        ? [row(true, 'watching', formatWatching(report.watching))]
        : []),
      ...(report.lockState === 'stale'
        ? [
            row(
              false,
              'lock',
              `left by a run that did not finish; \`${rmLockCommand(report.lock, sshHost || undefined)}\``
            )
          ]
        : []),
      row(
        report.implement.spent === undefined ||
          report.implement.spent >= report.implement.cap
          ? 'warn'
          : true,
        'implement',
        formatImplement(
          report.implement.spent,
          report.implement.cap,
          report.implement.last,
          report.implement.budget ?? IMPLEMENT_BUDGET_USD
        )
      ),
      report.next
        ? row(
            report.next.kind === 'skip' || report.next.kind === 'unknown'
              ? 'warn'
              : true,
            'next run',
            report.next.text
          )
        : row('warn', 'next run', 'unknown; script not installed'),
      report.suggest
        ? row(
            report.suggest.kind === 'skipped' ||
              report.suggest.kind === 'unknown'
              ? 'warn'
              : true,
            'suggest',
            report.suggest.text
          )
        : row('warn', 'suggest', 'unknown; no verdict from the script'),
      report.attended
        ? row(
            report.attended.kind === 'run' || report.attended.kind === 'unknown'
              ? 'warn'
              : true,
            'attended',
            report.attended.text
          )
        : row('warn', 'attended', 'unknown; no verdict from the script'),
      report.linear
        ? row(
            report.linear.kind === 'ok' ? true : 'warn',
            'linear tools',
            report.linear.text
          )
        : row('warn', 'linear tools', 'unknown; no verdict from the script'),
      ...(report.queueView === null
        ? [row('warn', 'queue view', 'unknown; no queue view from the script')]
        : report.queueView === 'malformed'
          ? [row('warn', 'queue view', 'malformed queue view from the script')]
          : [
              row(true, 'next', formatNext(report.queueView)),
              row(
                report.queueView.held.tickets.length > 0 ? 'warn' : true,
                'held',
                formatHeld(report.queueView)
              ),
              row(true, 'parked', formatParked(report.queueView)),
              row(true, 'on your table', formatTable(report.queueView))
            ])
    ];
    ctx.ui.table(['', 'check', 'detail'], rows);

    const problems = rows.filter((r) => r[0] === symbols.fail).length;
    const warnings = rows.filter((r) => r[0] === symbols.warn).length;
    const summary =
      problems > 0
        ? `${problems} thing(s) need attention`
        : warnings > 0
          ? `Loaded, with ${warnings} thing(s) worth a look`
          : 'The queue is healthy';
    return { summary, partial: problems > 0, json: report };
  }
});

/** The report of the queue on this machine */
async function localReport(ctx: Context): Promise<RemoteReport> {
  const host = requireHost(['launchd', 'container'], ctx.env);
  const queue = paths(ctx.env);
  const worktree = worktreeOf(ctx);

  return ctx.ui.task(
    'Reading the agent queue',
    async () => {
      const [job, key] = await Promise.all([
        host === 'container'
          ? Promise.resolve({ loaded: false as const })
          : jobState(),
        keyPresent(ctx.env)
      ]);
      const installed = byFile((file) => readText(queue.files[file]));
      const sources = readQueueSources(ctx.root);
      // Before the check, which logs its own skip and busy lines
      const lastScheduled =
        lastSchedulerLine(readText(queue.schedulerLog) ?? '') ?? null;
      const checked = await checkRun(queue, worktree, ctx.env).catch(
        (error: unknown): Awaited<ReturnType<typeof checkRun>> => ({
          decision: `skip: check failed (${error instanceof Error ? error.message : String(error)})`
        })
      );
      return {
        job,
        paused: existsSync(queue.paused),
        notifyLevel: parseNotifyLevel(readText(queue.notifyLevel)),
        host,
        keySource: linearKeySource(host, ctx.env),
        keyPresent: key,
        mirror: readText(queue.mirror)?.split('\n')[0]?.trim() || null,
        script:
          'source' in sources
            ? filesDrift(installed, sources.source)
            : ('no-source' as const),
        installedAny: Object.values(installed).some(
          (text) => text !== undefined
        ),
        watching: parseWatchState(readText(queue.watchState)),
        worktree: { path: worktree, exists: existsSync(worktree) },
        lastScheduled,
        // Without launchd the lock owner cannot be checked, so a held lock counts as a run
        lockState: lockState(
          lockAge(queue.lock),
          host === 'container' || (job.loaded && job.running)
        ),
        lock: queue.lock,
        implement: implementReport(queue, ctx.env),
        listener:
          host === 'container'
            ? parseListener(readText(join(queue.home, 'listener.json')))
            : null,
        next: checked === undefined ? null : parseCheck(checked.decision),
        attended:
          checked?.attended === undefined
            ? null
            : parseAttended(checked.attended),
        linear:
          checked?.linear === undefined ? null : parseLinear(checked.linear),
        suggest:
          checked?.suggest === undefined ? null : parseSuggest(checked.suggest),
        queueView:
          checked?.queueView === undefined
            ? null
            : (parseQueueView(checked.queueView) ?? ('malformed' as const))
      };
    },
    () => 'Read the agent queue'
  );
}

/** The remote check alone may take 90 s (`checkRun`); ssh and the vault fetch come on top */
const REMOTE_TIMEOUT_MS = 150_000;

/** The report of the queue in the agent container on `host`, over ssh */
async function remoteReport(host: string): Promise<RemoteReport> {
  let stdout: string;
  try {
    stdout = (
      await exec('ssh', remoteStatus(host), { timeout: REMOTE_TIMEOUT_MS })
    ).stdout;
  } catch (error) {
    if (!(error instanceof CommandError)) throw error;
    // A queue with problems exits non-zero but still answers
    const answer = parseRemoteStatus(error.stdout);
    if (answer.kind !== 'none') return fromAnswer(host, answer, error.stdout);
    throw new CliError(
      `Could not read the status over ssh on ${host}: ${error.stderr.trim() || error.message}`,
      undefined,
      `Check that the host is reachable and the container ${REMOTE_CONTAINER} runs`
    );
  }
  return fromAnswer(host, parseRemoteStatus(stdout), stdout);
}

/** The report, or the error the remote's answer explains, whatever ssh exited with */
function fromAnswer(
  host: string,
  answer: ReturnType<typeof parseRemoteStatus>,
  stdout: string
): RemoteReport {
  switch (answer.kind) {
    case 'report':
      return answer.report;
    case 'failed':
      throw new CliError(`${host}: ${answer.message}`, undefined, answer.hint);
    case 'skew':
      throw new CliError(skewedStatus(host, answer.paths, answer.line));
    case 'none':
      throw new CliError(unreadableStatus(host, stdout));
  }
}
