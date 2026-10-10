import { withCamelCase } from '@codeware/shared/util/zod';
import { z } from 'zod';

import { IpTypeSchema } from './ip-type.schema';

/**
 * Fly ips list response element schema
 *
 * ```ts
 * fly ips list --app [name] --json
 * ```
 *
 * Fly answers in PascalCase (`ID`, `Address`, …), which `withCamelCase`
 * rewrites before validation — so the keys here are the transformed ones.
 *
 * A shared v4 carries an empty `region` and a zero `createdAt`, so neither can
 * be treated as a datetime.
 */
export const IpsListFlyResponseElementSchema = z.object({
  id: z.string(),
  address: z.string(),
  type: IpTypeSchema,
  region: z.string(),
  createdAt: z.string()
});

/**
 * Transformed ips list response schema
 *
 * ```ts
 * fly ips list --app [name] --json
 * ```
 */
export const IpsListTransformedResponseSchema = z.array(
  withCamelCase(IpsListFlyResponseElementSchema)
);
