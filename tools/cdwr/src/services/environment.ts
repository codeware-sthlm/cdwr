import { EnvironmentSchema } from '@codeware/shared/feature/infisical';

import { type InputSpec, input } from '../cli/inputs';

import { listPreviewCmsApps, pullRequestOf } from './fly';
import { currentPullRequest } from './github';

export const ENVIRONMENTS = EnvironmentSchema.options;

/** The deployed environments, without development */
export const DEPLOYED = ['production', 'preview'] as const;

const HINTS: Record<string, string> = {
  development: 'your local setup',
  preview: 'a pull request deployment',
  production: 'the live system'
};

/** `--environment`, remembered across commands */
export const environmentInput = <
  const V extends ReadonlyArray<string> = typeof ENVIRONMENTS
>(
  values: V = ENVIRONMENTS as unknown as V,
  overrides: Partial<Parameters<typeof input.enum>[1]> = {}
) =>
  input.enum(values, {
    prompt: 'Which environment?',
    flag: 'env',
    short: 'e',
    remember: true,
    hints: HINTS,
    ...overrides
  });

/**
 * `--preview-app`: the cms host app holding a preview database. Asked only for
 * preview. On a pull request branch, that pull request's app is offered first.
 */
export const previewAppInput = (): InputSpec<string | undefined> =>
  input.optional(
    input.select<string>({
      prompt: 'Which cms app holds the preview database?',
      description: 'Preview cms host app, such as cdwr-cms-pr-123',
      choices: async (ctx) => {
        const apps = await listPreviewCmsApps();
        const mine = await currentPullRequest(ctx.root);
        return apps
          .map((app) => ({
            value: app,
            hint: pullRequestOf(app) === mine ? 'this branch' : undefined
          }))
          .sort((a, b) => (a.hint ? -1 : b.hint ? 1 : 0));
      }
    }),
    (r) => r['environment'] === 'preview'
  );
