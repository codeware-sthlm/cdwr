import { withCamelCase } from '@codeware/shared/util/zod';
import { z } from 'zod';

/**
 * Fly certs list response element schema
 *
 * ```ts
 * fly certs list --app [name] --json
 * ```
 */
export const CertsListFlyResponseElementSchema = z.object({
  createdAt: z.string().datetime(),
  hostname: z.string(),
  clientStatus: z.string()
});

/**
 * A Zod preprocessor which reads the certificate state from `status`
 * (flyctl 0.5 and later) or `clientStatus` (older flyctl),
 * so the schema always gets one `clientStatus`.
 *
 * Expects camelCased keys, so wrap it in `withCamelCase`.
 */
export const withClientStatus = <T extends z.ZodType>(schema: T) =>
  z.preprocess((data: unknown) => {
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return data;
    }
    const { status, ...rest } = data as Record<string, unknown>;
    return status === undefined ? rest : { ...rest, clientStatus: status };
  }, schema);

/**
 * Transformed certs list response schema
 *
 * ```ts
 * fly certs list --app [name] --json
 * ```
 */
export const CertsListTransformedResponseSchema = z.array(
  withCamelCase(withClientStatus(CertsListFlyResponseElementSchema))
);
