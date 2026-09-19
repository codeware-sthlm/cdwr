import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { type Need, defineCommand, readOnly } from '../cli/command';
import { type Check, check, onPath } from '../cli/preflight';
import { ENV_FILE, LEGACY_ENV_FILE } from '../cli/workspace';
import { symbols, theme } from '../ui/theme';

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
              | { node?: string }
              | undefined
          )?.node ?? ''
        )
      }
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
    ctx.ui.table(['', 'check', 'detail'], rows);

    const missing = report.checks.filter((c) => !c.ok).length;
    const warnings =
      (report.envFile === 'current' ? 0 : 1) + (report.onPath ? 0 : 1);
    const summary =
      missing > 0
        ? `${missing} thing(s) missing`
        : warnings > 0
          ? `Ready, with ${warnings} thing(s) worth fixing`
          : 'Everything is in place';
    return { summary, partial: missing > 0, json: report };
  }
});
