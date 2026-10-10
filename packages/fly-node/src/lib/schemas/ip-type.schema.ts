import { z } from 'zod';

/**
 * The kinds of public address an app can hold.
 *
 * `shared_v4` is the free one every app with an `http_service` needs; a
 * dedicated `v4` is billed. `v6` is dedicated and free.
 *
 * Kept open with a string union so an address type added upstream reads as
 * itself rather than failing the whole list.
 *
 * Its own module, free of the CLI's case transforms, so the API entry point
 * can share it without pulling them in.
 */
export const IpTypeSchema = z
  .enum(['v4', 'v6', 'shared_v4', 'private_v6'])
  .or(z.string());
