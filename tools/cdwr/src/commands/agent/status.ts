import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { defineCommand, readOnly } from '../../cli/command';
import {
  checkRun,
  jobState,
  keyPresent,
  lockAge,
  paths,
  readQueueSources,
  readText,
  requireMac,
  worktreeOf
} from '../../services/agent-queue';
import { symbols, theme } from '../../ui/theme';

import {
  byFile,
  filesDrift,
  formatWatching,
  lastSchedulerLine,
  latestRunLog,
  lockState,
  parseCheck,
  parseNotifyLevel,
  parseWatchState
} from './agent.logic';

export default defineCommand({
  summary:
    'Whether the scheduled planner is loaded, healthy and what it would take next',
  description:
    'Reads the launchd job, the pause flag, the Keychain item, the installed script, the worktree and the logs. Nothing is changed and no secret is read.',
  danger: 'read',
  inputs: {},

  async plan(ctx) {
    requireMac();
    const queue = paths(ctx.env);
    const worktree = worktreeOf(ctx);

    const report = await ctx.ui.task(
      'Reading the agent queue',
      async () => {
        const [job, key] = await Promise.all([jobState(), keyPresent()]);
        const installed = byFile((file) => readText(queue.files[file]));
        const sources = readQueueSources(ctx.root);
        const runLog = latestRunLog(
          existsSync(queue.logs) ? readdirSync(queue.logs) : []
        );
        // Before the check, which logs its own skip and busy lines
        const lastScheduled =
          lastSchedulerLine(readText(queue.schedulerLog) ?? '') ?? null;
        const line = await checkRun(queue, worktree, ctx.env).catch(
          (error: unknown) =>
            `skip: check failed (${error instanceof Error ? error.message : String(error)})`
        );
        return {
          job,
          paused: existsSync(queue.paused),
          notifyLevel: parseNotifyLevel(readText(queue.notifyLevel)),
          keyPresent: key,
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
          lastRunLog: runLog ? join(queue.logs, runLog) : null,
          next: line === undefined ? null : parseCheck(line)
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

    const rows = [
      job.loaded
        ? row(
            job.lastExitCode === undefined || job.lastExitCode === 0
              ? true
              : 'warn',
            'job',
            [
              job.running ? 'running' : 'loaded',
              job.runs === undefined ? undefined : `${job.runs} run(s)`,
              job.lastExitCode === undefined
                ? undefined
                : `last exit ${job.lastExitCode}`
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
        ? row(true, 'Linear key', 'in the Keychain')
        : row(
            false,
            'Linear key',
            'not in the Keychain (service linear-agent-queue)'
          ),
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
            `${report.lastScheduled.at} ${report.lastScheduled.message}`
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
      report.next
        ? row(
            report.next.kind === 'skip' || report.next.kind === 'unknown'
              ? 'warn'
              : true,
            'next run',
            report.next.text
          )
        : row('warn', 'next run', 'unknown; script not installed')
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
