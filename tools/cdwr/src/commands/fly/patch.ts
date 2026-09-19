import { randomUUID } from 'node:crypto';
import {
  existsSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as TOML from 'smol-toml';
import { z } from 'zod';

import { type PlanStep, defineCommand } from '../../cli/command';
import { CliError, messageOf } from '../../cli/errors';
import { input } from '../../cli/inputs';
import { fly, listAppNames, pullRequestOf } from '../../services/fly';

import {
  diffTOML,
  mergeTOML,
  renderPatchDiff,
  summarizeChanges
} from './patch.logic';

const PATCHES_DIR = join(dirname(fileURLToPath(import.meta.url)), 'patches');

interface PatchFile {
  name: string;
  path: string;
  hint: string;
}

interface PatchTarget {
  app: string;
  config: string;
  image?: string;
}

/** Every `*.toml` patch beside this command, its first `#` comment as a hint */
function discoverPatches(dir: string): PatchFile[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((file) => file.endsWith('.toml'))
    .map((file) => {
      const path = join(dir, file);
      const first = readFileSync(path, 'utf8').split('\n')[0] ?? '';
      return {
        name: basename(file, '.toml'),
        path,
        hint: first.startsWith('#') ? first.slice(1).trim() : ''
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

const patchFileSchema = z.string().refine((path) => {
  try {
    TOML.parse(readFileSync(path, 'utf8'));
    return true;
  } catch {
    return false;
  }
}, 'Not a valid TOML file');

/** The chosen patch's content, from the library or a custom file */
function patchContentFor(patch: string, patchFile: string | undefined): string {
  if (patch === 'custom') {
    if (!patchFile) {
      throw new CliError("--patch-file is required when --patch is 'custom'");
    }
    return readFileSync(patchFile, 'utf8');
  }
  const found = discoverPatches(PATCHES_DIR).find((p) => p.name === patch);
  if (!found) throw new CliError(`Unknown patch '${patch}'`);
  return readFileSync(found.path, 'utf8');
}

/** A file under the OS temp dir for the duration of `fn`, removed afterwards */
async function withTempFile<T>(
  label: string,
  fn: (path: string) => Promise<T>
): Promise<T> {
  const path = join(tmpdir(), `cdwr-fly-patch-${label}-${randomUUID()}.toml`);
  try {
    return await fn(path);
  } finally {
    rmSync(path, { force: true });
  }
}

export default defineCommand({
  summary: 'Merge a TOML patch into app configs and redeploy',
  description:
    'Fetches each app’s live config, merges a patch into it and redeploys with the current image. Arrays in the patch replace the base entirely; tables merge key by key.',
  danger: 'destructive',
  needs: ['fly'],
  inputs: {
    patch: input.select<string>({
      prompt: 'Which patch?',
      choices: () => [
        ...discoverPatches(PATCHES_DIR).map((p) => ({
          value: p.name,
          label: p.name,
          hint: p.hint || undefined
        })),
        {
          value: 'custom',
          label: 'Custom file...',
          hint: 'Provide a path to a TOML file'
        }
      ]
    }),
    patchFile: input.optional(
      input.string({
        prompt: 'Path to the patch TOML file?',
        schema: patchFileSchema
      }),
      (r) => r['patch'] === 'custom'
    ),
    prefix: input.string({
      prompt: 'Filter apps by prefix?',
      flagOnly: true,
      default: ''
    }),
    apps: input.multiselect<string>({
      prompt: 'Which apps to patch?',
      min: 1,
      choices: async (_ctx, resolved) => {
        const prefix =
          typeof resolved['prefix'] === 'string' ? resolved['prefix'] : '';
        return (await listAppNames())
          .filter((name) => name.startsWith(prefix))
          .map((value) => ({ value }));
      }
    })
  },

  async plan(ctx, { patch, patchFile, apps }) {
    const patchContent = patchContentFor(patch, patchFile);
    const steps: PlanStep[] = [];
    const notes: string[] = [];
    const targets: PatchTarget[] = [];

    for (const app of apps) {
      const current = await ctx.ui.task(`Reading config for ${app}`, () =>
        withTempFile(`${app}-config`, async (path) => {
          await fly().config.save({ app, config: path });
          return readFileSync(path, 'utf8');
        })
      );

      const merged = mergeTOML(current, patchContent);
      const hunks = diffTOML(current, merged);
      if (hunks.length === 0) {
        notes.push(`${app}: no changes, skipped`);
        continue;
      }

      const changes = summarizeChanges(current, merged);
      ctx.ui.write(renderPatchDiff(app, changes, hunks));

      const status = await fly().status({ app });
      const machine = status?.machines[0];
      const image = machine
        ? `${machine.imageRef.registry}/${machine.imageRef.repository}:${machine.imageRef.tag}`
        : undefined;

      targets.push({ app, config: merged, image });
      steps.push({ label: `Patch ${app}`, detail: changes.join(', ') });
    }

    if (targets.length === 0) {
      return {
        steps: [],
        notes,
        nothing: 'No changes for any selected app',
        data: { targets: [] }
      };
    }

    return {
      steps,
      notes,
      // One production app in the batch makes the whole batch production
      target: {
        environment: apps.every(pullRequestOf) ? 'preview' : 'production',
        name: apps.length === 1 ? apps[0] : 'production'
      },
      data: { targets }
    };
  },

  async apply(ctx, { targets }) {
    const patched: string[] = [];
    const failed: string[] = [];

    for (const target of targets) {
      try {
        await ctx.ui.task(
          `Deploying ${target.app}`,
          () =>
            withTempFile(`${target.app}-deploy`, async (path) => {
              writeFileSync(path, target.config, 'utf8');
              await fly().deploy({
                app: target.app,
                config: path,
                image: target.image
              });
            }),
          () => `Deployed ${target.app}`
        );
        patched.push(target.app);
      } catch (error) {
        ctx.ui.warn(`Failed to deploy ${target.app}: ${messageOf(error)}`);
        failed.push(target.app);
      }
    }

    const partial = failed.length > 0;
    return {
      summary: partial
        ? `Patched ${patched.length}/${targets.length} app(s); failed: ${failed.join(', ')}`
        : `Patched ${patched.length} app(s)`,
      partial,
      json: { patched, failed }
    };
  }
});
