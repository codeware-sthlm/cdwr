/**
 * Fly over its GraphQL API, without the CLI.
 *
 * A separate entry point because the two halves of this package have different
 * runtime requirements: the `Fly` class shells out to `flyctl` and reaches a
 * native pty module through `@codeware/shared/util/misc`, neither of which
 * exists inside an application image. Importing the root barrel to reach
 * `FlyApi` would pull all of that into the bundle.
 *
 * Nothing here touches the filesystem or spawns a process, so it runs anywhere
 * `fetch` does.
 */
export { FlyApi, FlyApiError, type FlyApiConfig } from './lib/fly-api.class';
export {
  type AppIpAddress,
  AppIpAddressesApiResponseSchema,
  AppIpAddressSchema
} from './lib/schemas/app-ip-addresses.schema';
export {
  type Certificate,
  CertificateApiResponseSchema,
  CertificateListApiResponseSchema,
  type DnsInstructions,
  DnsInstructionsSchema,
  type HostnameCheck,
  HostnameCheckApiResponseSchema
} from './lib/schemas/certificate.schema';
export {
  type Machine,
  MachineApiResponseSchema,
  MachineListApiResponseSchema
} from './lib/schemas/machine.schema';
