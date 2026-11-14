import {
  type Environment,
  EnvironmentSchema
} from '@codeware/shared/util/nx-deploy';
import { z } from 'zod';

type PrettyPartial<T> = {
  [K in keyof T]?: T[K];
} & {};

// 'preview' environment requires a pull request number
const BasePreviewSchema = z.object({
  environment: z.literal(EnvironmentSchema.enum.preview),
  pullRequest: z
    .number({
      error: (issue) =>
        issue.input === undefined
          ? 'A pull request number is required'
          : undefined
    })
    .describe('Pull request number')
});

// 'production' environment have no additional context
const BaseProductionSchema = z.object({
  environment: z.literal(EnvironmentSchema.enum.production)
});

const DeployActionSchema = z.object({ action: z.literal('deploy') });

// Should be used to validate `BuildingContext` data
export const ContextSchema = z.discriminatedUnion('environment', [
  BasePreviewSchema.merge(DeployActionSchema),
  BaseProductionSchema.merge(DeployActionSchema)
]);

// Export type definitions
export type Context = z.infer<typeof ContextSchema>;

// Context builder helper types
type BasePreview = z.infer<typeof BasePreviewSchema>;

/**
 * A type that is a subset of `Context` and should be used
 * as a flexible context builder by `flyDeployment`.
 *
 * For data safety the context must be validated by `ContextSchema`.
 */
export type BuildingContext = PrettyPartial<
  {
    action: 'deploy';
    environment: Environment;
  } & Pick<BasePreview, 'pullRequest'>
>;
