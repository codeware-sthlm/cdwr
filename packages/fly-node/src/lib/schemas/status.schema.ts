import { withCamelCase } from '@codeware/shared/util/zod';
import { z } from 'zod';

/**
 * Fly status response schema
 *
 * ```ts
 * fly status --app [name] --json
 * ```
 */
export const statusFlyResponseSchema = z.object({
  deployed: z.boolean(),
  hostname: z.string(),
  id: z.string(),
  machines: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      state: z.string(),
      region: z.string(),
      imageRef: z.object({
        registry: z.string(),
        repository: z.string(),
        tag: z.string(),
        digest: z.string(),
        labels: z.record(z.string()).optional()
      }),
      createdAt: z.string().datetime(),
      updatedAt: z.string().datetime(),
      config: z.object({
        env: z.record(z.string()),
        metadata: z.record(z.string()),
        guest: z
          .object({
            cpu_kind: z.string().optional(),
            cpus: z.number().optional(),
            memory_mb: z.number().optional()
          })
          .optional()
      }),
      events: z.array(
        z.object({
          type: z.string(),
          status: z.string(),
          timestamp: z.number()
        })
      ),
      checks: z
        .array(
          z.object({
            name: z.string(),
            status: z.string(),
            output: z.string(),
            updatedAt: z.string().datetime()
          })
        )
        .optional(),
      hostStatus: z.string()
    })
  ),
  name: z.string(),
  organization: z.object({
    id: z.string(),
    slug: z.string()
  }),
  status: z.string(),
  version: z.number()
});

/**
 * Transformed status response schema
 *
 * ```ts
 * fly status --app [name] --json
 * ```
 */
export const StatusTransformedResponseSchema = withCamelCase(
  statusFlyResponseSchema,
  {
    preserve: [
      'machines.config.env',
      'machines.config.metadata',
      'machines.config.guest'
    ],
    specialCases: { AppURL: 'appUrl' }
  }
);

/**
 * Lenient status response schema for internal lookups
 *
 * Fly briefly reports a machine mid-update without `imageRef`, `config` and
 * `events`. A lookup only needs the app name, hostname and each machine's
 * id and state, so everything else is let through unchecked.
 *
 * Internal, not part of the public API.
 */
export const statusLookupSchema = withCamelCase(
  z
    .object({
      name: z.string(),
      hostname: z.string(),
      machines: z.array(
        z
          .object({
            id: z.string(),
            state: z.string()
          })
          .passthrough()
      )
    })
    .passthrough()
);

export type StatusLookup = z.infer<typeof statusLookupSchema>;
