import { z } from 'zod';

import { IpTypeSchema } from './ip-type.schema';

/**
 * One address an app holds, in the shape `fly ips list` reports it.
 *
 * Only `address` and `type`: a shared v4 carries no id, region or creation
 * time, and a caller pointing DNS at an app needs nothing else.
 */
export const AppIpAddressSchema = z.object({
  address: z.string(),
  type: IpTypeSchema
});

export type AppIpAddress = z.infer<typeof AppIpAddressSchema>;

/**
 * An app's addresses as the Fly GraphQL API returns them.
 *
 * Fly keeps the shared v4 apart from the rest: `sharedIpAddress` is a plain
 * string, null when the app has none, and never appears in `ipAddresses`.
 * A dedicated v4 does appear there, with type `v4`.
 */
export const AppIpAddressesApiResponseSchema = z.object({
  sharedIpAddress: z.string().nullish(),
  ipAddresses: z.object({ nodes: z.array(AppIpAddressSchema) })
});
