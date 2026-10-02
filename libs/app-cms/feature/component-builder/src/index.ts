export { buildComponent } from './lib/build-component';
export {
  DEFAULT_BUNDLED_PACKAGES,
  DEFAULT_HOST_MODULES,
  HOST_REGISTRY_GLOBAL
} from './lib/host-modules';
export type {
  BuildComponentOptions,
  BuildComponentResult,
  ComponentDiagnostic,
  ComponentProp,
  ComponentPropKind,
  HostModule
} from './lib/types';
export { compareComponentProps } from './lib/compare-component-props';
export {
  type ComponentBuildDeps,
  type ComponentBuildInput,
  type ToolchainLocation,
  errorDiagnostic,
  runComponentBuild
} from './lib/run-component-build';
export {
  type ComponentToolchain,
  type ToolchainResult,
  resolveToolchain
} from './lib/toolchain';
