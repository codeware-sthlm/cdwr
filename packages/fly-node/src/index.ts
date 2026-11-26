// The api half is also its own entry point (`@cdwr/fly-node/api`), for
// consumers that cannot take the CLI's native dependencies
export * from './api';
export * from './lib/fly.class';
export type {
  AllocateIpOptions,
  BuildResponse,
  Config,
  DeployAppOptions,
  DeployResponse,
  DestroyAppOptions,
  DestroyAppResponse,
  ListIpResponse,
  MachineOperationOptions,
  SaveConfigOptions,
  StatusResponse
} from './lib/types';
