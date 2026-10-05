import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { type Need, defineCommand, readOnly } from '../cli/command';
import { type Shell, collect, render } from '../cli/completion';
import type { Context } from '../cli/context';
import { type Check, check, onPath } from '../cli/preflight';
import { cdwrHome } from '../cli/prefs';
import { ENV_FILE, LEGACY_ENV_FILE } from '../cli/workspace';
import {
  jobState,
  keyPresent,
  paths,
  queueDrift,
  worktreeOf
} from '../services/agent-queue';
import { symbols, theme } from '../ui/theme';

import { shellOf } from './completion';
import { completionFile, completionState } from './completion.logic';
import { ENTRIES, GROUPS } from './index';

const NEEDS: Need[] = [
  'fly',
  'psql',
  'pg_dump',
  'docker',
  'aws',
  'gh',
  'infisical'
];

interface Report {
  checks: Check[];
  envFile: 'current' | 'legacy' | 'missing';
  onPath: boolean;
  node: string;
  /** Tool versions the workspace pins, read from its manifests */
  versions: { nx: string; pnpm: string; nodeWanted: string };
  /** The completion script of the shell in $SHELL, against what the registry renders */
  completion: {
    shell: Shell | null;
    file: string | null;
    state: 'current' | 'stale' | 'missing' | 'unsupported' | 'unknown';
  };
  /** The scheduled agent queue; macOS only */
  agentQueue?: {
    loaded: boolean;
    keyPresent: boolean;
    worktree: boolean;
    script: 'missing' | 'current' | 'stale';
  };
}

/** The agent queue at a glance; `cdwr agent status` has the detail */
async function agentQueue(ctx: Context): Promise<Report['agentQueue']> {
  if (process.platform !== 'darwin') return undefined;
  const queue = paths(ctx.env);
  const [job, key] = await Promise.all([jobState(), keyPresent()]);
  return {
    loaded: job.loaded,
    keyPresent: key,
    worktree: existsSync(worktreeOf(ctx)),
    script: queueDrift(queue, ctx.root)
  };
}

async function completion(ctx: Context): Promise<Report['completion']> {
  const shell = shellOf(ctx.env['SHELL']);
  if (!shell) return { shell: null, file: null, state: 'unsupported' };
  const file = completionFile(shell, {
    cdwrHome: cdwrHome(ctx.env),
    home: homedir()
  });
  // Rendering loads every command; a broken one must not take the report down
  try {
    const installed = existsSync(file) ? readFileSync(file, 'utf8') : undefined;
    const rendered = render(shell, GROUPS, await collect(ENTRIES));
    return { shell, file, state: completionState(installed, rendered) };
  } catch {
    return { shell, file, state: 'unknown' };
  }
}

const readJson = (file: string): Record<string, unknown> => {
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
  } catch {
    return {};
  }
};

export default defineCommand({
  summary: 'Check binaries, credentials and the shell setup',
  description:
    'Tells you what every command relies on and what is missing, so a run never fails halfway.',
  danger: 'read',
  inputs: {},

  async plan(ctx) {
    const report: Report = {
      checks: NEEDS.map((need) => check(need, ctx.env)),
      envFile: existsSync(join(ctx.root, ENV_FILE))
        ? 'current'
        : existsSync(join(ctx.root, LEGACY_ENV_FILE))
          ? 'legacy'
          : 'missing',
      onPath: onPath('cdwr', ctx.env),
      node: process.version,
      versions: {
        nx: String(
          readJson(join(ctx.root, 'node_modules/nx/package.json'))['version'] ??
            'not installed'
        ),
        pnpm:
          String(
            readJson(join(ctx.root, 'package.json'))['packageManager'] ?? ''
          ).replace(/^pnpm@/, '') || 'unpinned',
        nodeWanted: String(
          (
            readJson(join(ctx.root, 'package.json'))['engines'] as
              { node?: string } | undefined
          )?.node ?? ''
        )
      },
      completion: await completion(ctx),
      agentQueue: await agentQueue(ctx)
    };
    return readOnly(report);
  },

  async apply(ctx, report) {
    const rows = report.checks.map((c) => [
      c.ok ? symbols.ok : symbols.fail,
      c.need,
      c.ok ? theme.muted(c.detail) : theme.warn(c.detail)
    ]);
    rows.push([
      symbols.ok,
      'node',
      theme.muted(
        `${report.node}${report.versions.nodeWanted ? `  (wants ${report.versions.nodeWanted})` : ''}`
      )
    ]);
    rows.push([symbols.ok, 'pnpm', theme.muted(report.versions.pnpm)]);
    rows.push([
      report.versions.nx === 'not installed' ? symbols.fail : symbols.ok,
      'nx',
      theme.muted(report.versions.nx)
    ]);
    rows.push(
      report.envFile === 'current'
        ? [symbols.ok, 'env file', theme.muted(ENV_FILE)]
        : report.envFile === 'legacy'
          ? [
              symbols.warn,
              'env file',
              theme.warn(`still at ${LEGACY_ENV_FILE}; move it to ${ENV_FILE}`)
            ]
          : [
              symbols.fail,
              'env file',
              theme.warn(`create ${ENV_FILE} from the .env.example beside it`)
            ]
    );
    rows.push(
      report.onPath
        ? [symbols.ok, 'cdwr', theme.muted('on PATH')]
        : [
            symbols.warn,
            'cdwr',
            theme.warn('not on PATH; `cdwr setup` links it')
          ]
    );
    const { completion: comp } = report;
    const completionRows: Record<
      Report['completion']['state'],
      () => [string, string, string]
    > = {
      current: () => [
        symbols.ok,
        'completion',
        theme.muted(`${comp.shell} is current`)
      ],
      stale: () => [
        symbols.warn,
        'completion',
        theme.warn('out of date; run cdwr setup')
      ],
      missing: () => [
        symbols.ok,
        'completion',
        theme.muted('not installed; cdwr setup adds it')
      ],
      unknown: () => [
        symbols.ok,
        'completion',
        theme.muted('could not be checked')
      ],
      unsupported: () => [
        symbols.ok,
        'completion',
        theme.muted(
          `no completion for ${ctx.env['SHELL']?.split('/').pop() || 'this shell'}`
        )
      ]
    };
    rows.push(completionRows[comp.state]());
    const queue = report.agentQueue;
    let queueProblems = 0;
    // Optional per machine: never set up is not a problem
    if (queue && !queue.loaded && queue.script === 'missing') {
      rows.push([
        symbols.ok,
        'agent queue',
        theme.muted('not set up here; `cdwr agent install` if you want it')
      ]);
    } else if (queue) {
      const problems = [
        !queue.loaded && 'job not loaded',
        !queue.keyPresent && 'no Linear key',
        !queue.worktree && 'no worktree',
        queue.script === 'missing' && 'script not installed',
        queue.script === 'stale' && 'script out of date'
      ].filter((p) => p !== false);
      queueProblems = problems.length;
      rows.push(
        problems.length === 0
          ? [symbols.ok, 'agent queue', theme.muted('installed and current')]
          : [
              symbols.warn,
              'agent queue',
              theme.warn(`${problems.join(', ')}; \`cdwr agent install\``)
            ]
      );
    }
    ctx.ui.table(['', 'check', 'detail'], rows);

    const missing = report.checks.filter((c) => !c.ok).length;
    const warnings =
      (report.envFile === 'current' ? 0 : 1) +
      (report.onPath ? 0 : 1) +
      (comp.state === 'stale' ? 1 : 0) +
      (queueProblems > 0 ? 1 : 0);
    const summary =
      missing > 0
        ? `${missing} thing(s) missing`
        : warnings > 0
          ? `Ready, with ${warnings} thing(s) worth fixing`
          : 'Everything is in place';
    return { summary, partial: missing > 0, json: report };
  }
});
