import { existsSync } from 'fs';
import { readdir } from 'fs/promises';
import { basename, isAbsolute, join, resolve as resolvePath } from 'path';
import { pathToFileURL } from 'url';

import { UsageError } from '../cli/errors';
import { type InputSpec, input } from '../cli/inputs';

/** Where the repository keeps its site definitions */
export const DEFINITIONS_DIR = join(
  'libs',
  'shared',
  'util',
  'seed',
  'src',
  'lib',
  'site-definitions'
);

export type DefinitionEntry = {
  /** Path from the workspace root, which is what the command takes */
  path: string;
  /** What the definition calls the site, when it could be read */
  name?: string;
  description?: string;
};

/** A module's default export is a site definition when it has a name and pages */
const isSiteDefinition = (
  value: unknown
): value is { name: string; description?: string; pages: Array<unknown> } =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as { name?: unknown }).name === 'string' &&
  Array.isArray((value as { pages?: unknown }).pages);

/**
 * The definitions in the repository, each with what it says about itself.
 *
 * The name and description come from importing the module, which is cheap
 * because a definition is data with type-only imports. One that fails to load
 * is still offered — the path is what the command needs, and refusing to list
 * it would hide the very definition someone is trying to debug. A module that
 * loads but is not a definition, such as a helper, is left out.
 */
export async function listSiteDefinitions(
  root: string
): Promise<Array<DefinitionEntry>> {
  const dir = join(root, DEFINITIONS_DIR);

  const files = (await readdir(dir))
    .filter((file) => file.endsWith('.ts') && !file.endsWith('.spec.ts'))
    .sort();

  const entries = await Promise.all(
    files.map(async (file): Promise<DefinitionEntry | undefined> => {
      const path = join(DEFINITIONS_DIR, file);

      try {
        const imported = (await import(
          pathToFileURL(join(dir, file)).href
        )) as Record<string, unknown>;

        const definition = imported['default'];

        if (!isSiteDefinition(definition)) {
          return undefined;
        }
        return {
          path,
          name: definition.name,
          description: definition.description
        };
      } catch {
        return { path };
      }
    })
  );

  return entries.filter((entry): entry is DefinitionEntry => !!entry);
}

/**
 * The absolute path of the definition a `--definition` value names.
 *
 * A path, absolute or with a separator, is resolved from the workspace root and
 * must exist. A bare value is a definition's file name, with or without `.ts`,
 * or else the site name of exactly one listed definition. Anything else fails
 * here, listing what is available, rather than later as a module-not-found.
 */
export async function resolveDefinition(
  root: string,
  value: string
): Promise<string> {
  if (isAbsolute(value) || /[\\/]/.test(value)) {
    const path = resolvePath(root, value);
    if (!existsSync(path)) {
      throw new UsageError(`No definition at ${path}`);
    }
    return path;
  }

  const entries = await listSiteDefinitions(root);
  const fileOf = (entry: DefinitionEntry) => basename(entry.path);
  const fileName = value.endsWith('.ts') ? value : `${value}.ts`;

  const byFile = entries.find((entry) => fileOf(entry) === fileName);
  if (byFile) {
    return resolvePath(root, byFile.path);
  }

  const bySite = entries.filter((entry) => entry.name === value);
  if (bySite.length === 1) {
    return resolvePath(root, bySite[0].path);
  }
  if (bySite.length > 1) {
    throw new UsageError(
      `More than one definition is named '${value}'`,
      `Name one by its file: ${bySite.map((e) => basename(e.path, '.ts')).join(', ')}`
    );
  }

  throw new UsageError(
    `No definition called '${value}'`,
    `Available: ${entries
      .map((e) => {
        const file = basename(e.path, '.ts');
        return e.name ? `${file} (${e.name})` : file;
      })
      .join(', ')}`
  );
}

/**
 * `--definition`: one of the repository's definitions, or any path.
 *
 * `trustFlag` is what keeps both true. The choices are loaded only to fill the
 * prompt, never to validate a flag, so a definition living somewhere else is
 * still applied by naming its path. `resolveDefinition` checks the value
 * afterwards, and fails early on a name or path that matches nothing.
 */
export const definitionInput = (
  prompt = 'Which definition?'
): InputSpec<string> =>
  input.select<string>({
    prompt,
    description: 'A module exporting a SiteDefinition as its default',
    trustFlag: true,
    choices: async (ctx) => {
      const entries = await listSiteDefinitions(ctx.root);

      return entries.map(({ path, name, description }) => ({
        value: path,
        label: name ?? path,
        hint: description ?? path
      }));
    }
  });
