import { defineCommand } from '../../cli/command';
import { UsageError } from '../../cli/errors';
import { input } from '../../cli/inputs';
import { environmentInput } from '../../services/environment';
import {
  deleteInfisicalFolder,
  inspectInfisicalFolder
} from '../../services/infisical';

import { pathProblem } from './delete-folder.logic';

export default defineCommand({
  summary: 'Delete one Infisical folder in one environment',
  description:
    'Deletes the folder and everything below it in the given environment only; the Infisical UI deletes it in every environment. Lists each subfolder with its secret count first, never values. Needs a path at least two levels deep, such as /tenants/moon.',
  danger: 'destructive',
  needs: ['infisical'],
  inputs: {
    environment: environmentInput(),
    path: input.string({
      prompt: 'Which Infisical folder?',
      description: 'The folder to delete, e.g. /tenants/moon'
    })
  },

  async plan(ctx, { environment, path }) {
    const problem = pathProblem(path);
    if (problem) throw new UsageError(problem);

    const folders = await ctx.ui.task(
      `Reading ${path} for ${environment}`,
      () => inspectInfisicalFolder({ environment, path }),
      (list) => (list ? `${list.length} folder(s)` : 'not found')
    );

    if (!folders) {
      return {
        steps: [],
        nothing: `${path} does not exist in ${environment}; nothing to do`,
        data: { environment, path, folders: [] }
      };
    }

    return {
      steps: [
        `Delete ${path} in ${environment}, with everything below it`,
        ...folders.map(
          ({ path: folder, secrets }) => `${folder} (${secrets} secret(s))`
        )
      ],
      notes: [
        `Only ${environment} is affected; other environments keep ${path}`
      ],
      target: { environment, name: path },
      data: { environment, path, folders }
    };
  },

  async apply(ctx, { environment, path, folders }) {
    const deleted = await ctx.ui.task(
      `Deleting ${path} in ${environment}`,
      () => deleteInfisicalFolder({ environment, path }),
      (done) => (done ? `Deleted ${path}` : `Infisical did not find ${path}`)
    );
    // The plan just found the folder, so a 404 now means a wrong project or environment
    if (!deleted) {
      throw new Error(
        `Infisical answered 404 for ${path} in ${environment}, which the plan had just found; nothing was deleted`
      );
    }
    return {
      summary: `Deleted ${path} in ${environment}`,
      json: { environment, path, deleted, folders }
    };
  }
});
