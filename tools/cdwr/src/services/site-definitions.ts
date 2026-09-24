import { readdir } from 'fs/promises';
import { isAbsolute, join, resolve as resolvePath } from 'path';
import { pathToFileURL } from 'url';

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

/**
 * The definitions in the repository, each with what it says about itself.
 *
 * The name and description come from importing the module, which is cheap
 * because a definition is data with type-only imports. One that fails to load
 * is still offered — the path is what the command needs, and refusing to list
 * it would hide the very definition someone is trying to debug.
 */
export async function listSiteDefinitions(
  root: string
): Promise<Array<DefinitionEntry>> {
  const dir = join(root, DEFINITIONS_DIR);

  const files = (await readdir(dir))
    .filter((file) => file.endsWith('.ts') && !file.endsWith('.spec.ts'))
    .sort();

  return Promise.all(
    files.map(async (file) => {
      const path = join(DEFINITIONS_DIR, file);

      try {
        const imported = (await import(
          pathToFileURL(join(dir, file)).href
        )) as Record<string, unknown>;

        const definition = imported['default'] as
          { name?: string; description?: string } | undefined;

        return {
          path,
          name: definition?.name,
          description: definition?.description
        };
      } catch {
        return { path };
      }
    })
  );
}

/** A path from the flag, or from the workspace root when it is relative */
export const resolveDefinitionPath = (root: string, value: string): string =>
  isAbsolute(value) ? value : resolvePath(root, value);

/**
 * `--definition`: one of the repository's definitions, or any path.
 *
 * `trustFlag` is what keeps both true. The choices are loaded only to fill the
 * prompt, never to validate a flag, so a definition living somewhere else is
 * still applied by naming its path.
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
