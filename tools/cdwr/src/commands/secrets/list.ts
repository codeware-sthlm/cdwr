import { defineCommand } from '../../cli/command';
import { CliError, EXIT, messageOf } from '../../cli/errors';
import { input } from '../../cli/inputs';
import { DEPLOYED } from '../../services/environment';
import { listOrgTokens } from '../../services/fly';
import { probeSession } from '../infisical/session.logic';

import { PROJECTS, PROJECT_NAMES, environmentsOf } from './catalog';
import {
  type FlyTokens,
  type ReadKey,
  type ScopeRead,
  buildRows,
  groupByFolder,
  readProject,
  scope,
  wasRead
} from './list.logic';

/** The first line of an error, cut to fit a warning */
const shortMessage = (error: unknown): string =>
  (messageOf(error).split('\n')[0] ?? '').slice(0, 120);

const flyTokens = async (): Promise<FlyTokens> => {
  try {
    return await listOrgTokens();
  } catch (error) {
    return { error: shortMessage(error) };
  }
};

export default defineCommand({
  summary: 'Every secret, redacted, with its purpose, expiry and rotation',
  description:
    'Reads both Infisical projects through your own `infisical login` and lists every key in every folder, with what it is for, when it expires and how to rotate it. Values are never shown: only `set · <n> chars` or `empty`. Expiry comes from Fly tokens by name. Keys the catalog does not know read `not in the catalog`.',
  danger: 'read',
  inputs: {
    project: input.enum(PROJECT_NAMES, {
      prompt: 'Which Infisical project?',
      description: 'Only this project',
      short: 'p',
      optional: true,
      flagOnly: true
    }),
    environment: input.enum(DEPLOYED, {
      prompt: 'Which environment?',
      flag: 'env',
      short: 'e',
      description: 'Only this environment',
      optional: true,
      flagOnly: true
    })
  },

  async plan(ctx, { project, environment }) {
    const pairs = scope(project, environment);
    if (pairs.length === 0) {
      return {
        steps: [],
        nothing: 'Nothing in scope: that project has no such environment',
        data: {
          read: [] as ScopeRead[],
          tokens: [] as FlyTokens
        }
      };
    }

    // Each project is its own Infisical session scope: one that refuses is a failed scope
    const refused = new Map<string, string>();
    for (const project of new Set(pairs.map((pair) => pair.project))) {
      const session = await ctx.ui.task(
        `Checking the Infisical session (${project})`,
        async () =>
          probeSession(
            environmentsOf(project)[0] ?? 'production',
            undefined,
            PROJECTS[project].id
          )
      );
      if (session.state === 'not-installed') {
        throw new CliError(
          'Infisical CLI is not installed',
          EXIT.failed,
          session.hint
        );
      }
      if (session.state === 'failed') {
        refused.set(project, shortMessage(session.message));
      }
    }

    const read: ScopeRead[] = [];
    for (const pair of pairs) {
      const error = refused.get(pair.project);
      if (error !== undefined) {
        read.push({ ...pair, error });
        continue;
      }
      try {
        const keys = await ctx.ui.task(
          `Reading ${pair.project} (${pair.environment})`,
          async () => readProject(pair.project, pair.environment),
          (list) => `${list.length} key(s)`
        );
        read.push({ ...pair, keys });
      } catch (error) {
        read.push({ ...pair, error: shortMessage(error) });
      }
    }
    const tokens = await ctx.ui.task('Reading Fly token expiry', flyTokens);
    return { steps: [], data: { read, tokens } };
  },

  async apply(ctx, { read, tokens }) {
    const succeeded = read.filter(wasRead);
    const failed = read.flatMap((result) =>
      'error' in result
        ? [
            {
              project: result.project,
              environment: result.environment,
              error: result.error
            }
          ]
        : []
    );
    for (const { project, environment, error } of failed) {
      ctx.ui.warn(`${project} · ${environment}: could not read: ${error}`);
    }
    if (read.length > 0 && succeeded.length === 0) {
      throw new CliError(
        'No scope could be read',
        EXIT.failed,
        'If your session expired: `infisical login`'
      );
    }
    const flyError = Array.isArray(tokens) ? undefined : tokens.error;
    if (flyError !== undefined) ctx.ui.warn(`Fly tokens: ${flyError}`);

    const rows = buildRows(succeeded, tokens);
    const { verbose } = ctx.flags;
    // One table per folder keeps the columns narrow; -v adds what wraps
    for (const [heading, folder] of groupByFolder(rows)) {
      ctx.ui.info(heading);
      ctx.ui.table(
        [
          'key',
          'value',
          'kind',
          'expiry',
          'rotate',
          ...(verbose ? ['purpose'] : [])
        ],
        folder.map((row) => [
          row.key,
          row.value,
          row.kind,
          row.expiry,
          row.rotateBy === 'manual' && !verbose ? 'by hand' : row.rotate,
          ...(verbose ? [row.purpose] : [])
        ])
      );
    }
    const unknown = rows.filter((row) => !row.known);
    return {
      summary: `${rows.length} secret(s), ${unknown.length} not in the catalog`,
      json: { rows, failed, flyError }
    };
  }
});
