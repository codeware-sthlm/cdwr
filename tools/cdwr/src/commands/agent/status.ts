import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { defineCommand, readOnly } from '../../cli/command';
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
import { symbols, theme } from '../../ui/theme';

import {
  KEYCHAIN_SERVICE,
  LINEAR_KEY_ENV,
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
  latestRunLog,
  linearKeySource,
  lockState,
  parseAttended,
  parseCheck,
  parseNotifyLevel,
  parseQueueView,
  parseSuggest,
  parseWatchState,
  summarizeSchedulerLine
} from './agent.logic';

export default defineCommand({
  summary:
    'Whether the scheduled planner is loaded, healthy and what it would take next',
  description:
    'Reads the launchd job, the pause flag, the Keychain item, the installed script, the worktree and the logs. Nothing is changed and no secret is read.',
  danger: 'read',
  inputs: {},

  async plan(ctx) {
    const host = requireHost(['launchd', 'container'], ctx.env);
    const queue = paths(ctx.env);
    const worktree = worktreeOf(ctx);

    const report = await ctx.ui.task(
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
        const runLog = latestRunLog(
          existsSync(queue.logs) ? readdirSync(queue.logs) : []
        );
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
          lockState: lockState(lockAge(queue.lock), job.loaded && job.running),
          lock: queue.lock,
          implement: implementReport(queue, ctx.env),
          lastRunLog: runLog ? join(queue.logs, runLog) : null,
          next: checked === undefined ? null : parseCheck(checked.decision),
          attended:
            checked?.attended === undefined
              ? null
              : parseAttended(checked.attended),
          suggest:
            checked?.suggest === undefined
              ? null
              : parseSuggest(checked.suggest),
          queueView:
            checked?.queueView === undefined
              ? null
              : (parseQueueView(checked.queueView) ?? ('malformed' as const))
        };
      },
      () => 'Read the agent queue'
    );
    return readOnly(report);
  },

  async apply(ctx, report) {
    const { job } = report;
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
        ? row(
            true,
            'job',
            `container loop, every ${RUN_INTERVAL_SECONDS / 60} min`
          )
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
          ? row('warn', 'scripts', 're-run `cdwr agent install`')
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
              `left by a run that did not finish; \`rmdir ${report.lock}\``
            )
          ]
        : []),
      row(
        report.implement.spent === undefined ? 'warn' : true,
        'implement',
        formatImplement(
          report.implement.spent,
          report.implement.cap,
          report.implement.last
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
