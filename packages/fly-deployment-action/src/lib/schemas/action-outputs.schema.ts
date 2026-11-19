import { EnvironmentSchema } from '@codeware/shared/util/nx-deploy';
import { z } from 'zod';

export const ActionSchema = z.enum(['deploy', 'destroy', 'failed', 'skipped']);

const FlyAppNameSchema = z.object({
  app: z.string().min(1, 'An app name is required').describe('App name')
});

// 'deploy' action requires project name, deployed app and url
const ActionDeploySchema = FlyAppNameSchema.merge(
  z.object({
    action: z.literal(ActionSchema.enum.deploy),
    name: z
      .string()
      .min(1, 'A name is required')
      .describe('Display label, `project (tenant)` when scoped'),
    projectName: z
      .string()
      .min(1, 'A project name is required')
      .describe('Nx project name, without any tenant suffix'),
    url: z
      .string()
      .min(1, 'A deployment URL is required')
      .describe('Deployment URL')
  })
);

// 'destroy' action requires the app name
const ActionDestroySchema = FlyAppNameSchema.merge(
  z.object({
    action: z.literal(ActionSchema.enum.destroy)
  })
);

// 'failed' action requires an app or project name and an error message
const ActionFailedSchema = z.object({
  action: z.literal(ActionSchema.enum.failed),
  appOrProject: z
    .string()
    .min(1, 'An app or project name is required')
    .describe('App or project name'),
  error: z
    .string()
    .min(1, 'An error message is required')
    .describe('Error message')
});

// 'skipped' action requires an app or project name and the reason, e.g. an
// older commit than the project's newest release
const ActionSkippedSchema = z.object({
  action: z.literal(ActionSchema.enum.skipped),
  appOrProject: z
    .string()
    .min(1, 'An app or project name is required')
    .describe('App or project name'),
  reason: z
    .string()
    .min(1, 'A reason is required')
    .describe('Why the project was not deployed')
});

// Combine the action schemas into a discriminated union
const ProjectSchema = z.discriminatedUnion('action', [
  ActionDeploySchema,
  ActionDestroySchema,
  ActionFailedSchema,
  ActionSkippedSchema
]);

// Final action outputs schema
export const ActionOutputsSchema = z.object({
  environment: EnvironmentSchema.or(z.null()),
  projects: z.array(ProjectSchema)
});

// Export type definitions
export type Action = z.infer<typeof ActionSchema>;
export type ActionOutputs = z.infer<typeof ActionOutputsSchema>;
