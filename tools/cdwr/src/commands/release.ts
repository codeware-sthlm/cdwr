import { join } from 'node:path';

import {
  createProjectGraphAsync,
  getPackageManagerCommand,
  readJsonFile,
  writeJsonFile
} from '@nx/devkit';
import npmWhoami from 'npm-whoami';
import { releaseChangelog, releasePublish, releaseVersion } from 'nx/release';
import type { PackageJson } from 'nx/src/utils/package-json';
import { z } from 'zod';

import { type Plan, defineCommand } from '../cli/command';
import { CliError, EXIT, UsageError, messageOf } from '../cli/errors';
import { input } from '../cli/inputs';
import { run, runAttached } from '../services/shell';

import {
  type Mode,
  type PublishStats,
  bumpSteps,
  decideRelease,
  hasNewVersion,
  publishSummary,
  publishableProjects,
  shouldRevertPackageJson
} from './release.logic';

const MODE_HINTS: Record<Mode, string> = {
  release: 'analyze commits, create changelog and publish',
  publish: 'release must have been pre-generated earlier'
};

// Local, not @codeware/shared/util/misc — that pulls in native deps for one helper
const whoami = (): Promise<string> =>
  new Promise((resolve) => {
    npmWhoami((err, user) => resolve(err || !user ? '' : user));
  });

/** Undo Nx's own edit to the workspace package.json: nx-payload sits in devDependencies */
async function revertPackageJson(
  root: string,
  origin: PackageJson
): Promise<void> {
  const path = join(root, 'package.json');
  const current = readJsonFile<PackageJson>(path);
  const pinned = origin.devDependencies?.['@cdwr/nx-payload'];
  if (!current.devDependencies || !pinned) return;
  current.version = origin.version;
  current.devDependencies['@cdwr/nx-payload'] = pinned;
  writeJsonFile(path, current, { appendNewLine: true });
  await run('git', ['add', 'package.json'], { cwd: root });
}

interface ReleaseData {
  mode: Mode;
  otp?: string;
  originPackageJson?: PackageJson;
  /** Whether to run the real version bump and changelog before anything else */
  bump: boolean;
  /** Whether to publish from here once bump/changelog (if any) are done */
  publishDirectly: boolean;
}

export default defineCommand({
  summary: 'Version, changelog, tag and publish the npm packages',
  description:
    'Bumps versions from conventional commits, writes changelogs, and either publishes the npm packages directly or leaves that to GitHub Actions.',
  danger: 'destructive',
  inputs: {
    mode: input.enum(['release', 'publish'], {
      prompt: 'What parts of the release process do you want to run?',
      default: 'release',
      initial: 'release',
      hints: MODE_HINTS
    }),
    postponePublish: input.boolean({
      prompt: 'Let GitHub Actions publish to npm?',
      initial: true,
      default: (r) => (r['mode'] === 'publish' ? false : undefined)
    }),
    otp: input.optional(
      input.secret({
        prompt: 'NPM OTP code from your 2FA app',
        schema: z.string().regex(/^\d{6}$/, 'OTP code must be a 6-digit number')
      }),
      (r) => r['mode'] === 'publish' || r['postponePublish'] === false
    )
  },

  async plan(ctx, { mode, postponePublish, otp }): Promise<Plan<ReleaseData>> {
    const publishingNow = mode === 'publish' || !postponePublish;

    if (publishingNow) {
      if (!otp) {
        throw new UsageError(
          '--otp is required to publish from here',
          'Pass --otp, or leave --postpone-publish on to let GitHub Actions publish instead'
        );
      }
      const user = await ctx.ui.task(
        'Checking npm login',
        () => whoami(),
        (name) => (name ? `Logged in as ${name}` : 'Not logged in')
      );
      if (!user) {
        throw new CliError(
          'npm publish requires you to be logged in',
          EXIT.failed,
          'Run `npm login`, then try again'
        );
      }
    }

    if (mode === 'publish') {
      return {
        steps: ['Publish the packages to npm'],
        target: { environment: 'production', name: 'release' },
        data: {
          mode,
          otp,
          bump: false,
          publishDirectly: true
        } satisfies ReleaseData
      };
    }

    const originPackageJson = readJsonFile<PackageJson>(
      join(ctx.root, 'package.json')
    );
    const preview = await ctx.ui.task(
      'Previewing the version bump',
      () =>
        releaseVersion({
          dryRun: true,
          gitCommit: false,
          gitTag: false,
          stageChanges: false,
          verbose: ctx.flags.verbose
        }),
      (r) =>
        hasNewVersion(r.projectsVersionData)
          ? 'Changes found'
          : 'Nothing to release'
    );

    if (!hasNewVersion(preview.projectsVersionData)) {
      return {
        steps: [],
        nothing: 'No release needed',
        data: {
          mode,
          otp,
          bump: false,
          publishDirectly: false
        } satisfies ReleaseData
      };
    }

    const decision = decideRelease(true, postponePublish);
    return {
      steps: [
        ...bumpSteps(preview.projectsVersionData),
        'Generate changelogs',
        decision === 'deferred'
          ? 'Let GitHub Actions publish the packages to npm'
          : 'Publish the packages to npm'
      ],
      target: { environment: 'production', name: 'release' },
      data: {
        mode,
        otp,
        originPackageJson,
        bump: true,
        publishDirectly: decision === 'publish'
      } satisfies ReleaseData
    };
  },

  async apply(ctx, { mode, otp, originPackageJson, bump, publishDirectly }) {
    const verbose = ctx.flags.verbose;

    if (bump) {
      const status = await ctx.ui.task(
        'Bumping versions',
        () => releaseVersion({ dryRun: false, verbose }),
        () => 'Versions bumped'
      );
      const versionData = status.projectsVersionData;

      if (
        originPackageJson &&
        shouldRevertPackageJson(originPackageJson, versionData)
      ) {
        ctx.ui.warn('Reverting an Nx auto-update to package.json (nx-payload)');
        await revertPackageJson(ctx.root, originPackageJson);
      }

      try {
        await ctx.ui.task('Generating changelogs', () =>
          releaseChangelog({ versionData, dryRun: false, verbose })
        );
      } catch (error) {
        throw new CliError(`Generating changelogs failed: ${messageOf(error)}`);
      }

      if (!publishDirectly) {
        return {
          summary: 'The new release will be published by GitHub Actions'
        };
      }
    }

    let stats: PublishStats | null = null;
    try {
      const { nodes } = await createProjectGraphAsync();
      const projects = publishableProjects(nodes);

      // A stale dist/ never gets published: rebuild before every publish, since
      // release mode's own build (part of the version bump) may have been skipped
      const pm = getPackageManagerCommand();
      const [bin, ...baseArgs] = pm.exec.split(' ');
      await ctx.ui.task('Rebuilding before publish', () =>
        runAttached(
          bin ?? 'pnpm',
          [
            ...baseArgs,
            'nx',
            'run-many',
            '-t',
            'build',
            '-p',
            projects.join(',')
          ],
          { cwd: ctx.root }
        )
      );

      const result = await releasePublish({
        dryRun: false,
        verbose,
        otp: Number(otp),
        projects
      });
      const values = Object.values(result);
      stats = {
        successful: values.filter((r) => r.code === 0).length,
        total: values.length
      };
    } catch (error) {
      ctx.ui.warn(messageOf(error));
    }

    const { summary, partial } = publishSummary(mode, stats);
    return { summary, partial, json: stats };
  }
});
