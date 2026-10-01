import {
  HOST_REGISTRY_GLOBAL,
  type HostModuleSpecifier
} from '@codeware/shared/util/payload-utils';

import type { HostModule } from './types';

export { HOST_REGISTRY_GLOBAL };

export const DEFAULT_HOST_MODULES = {
  react: {},
  'react-dom': {},
  'react-dom/client': {},
  'react/jsx-runtime': {},
  '@site/ui': {}
} as const satisfies Record<HostModuleSpecifier, HostModule>;

export const DEFAULT_BUNDLED_PACKAGES = [
  'lucide-react',
  'class-variance-authority',
  'react-hook-form',
  'zod',
  'recharts'
] as const;

export const hostShim = (specifier: string): string =>
  `module.exports = globalThis.${HOST_REGISTRY_GLOBAL}[${JSON.stringify(specifier)}];`;

/** True when `specifier` is `pkg` or a subpath of `pkg`. */
export const matchesPackage = (specifier: string, pkg: string): boolean =>
  specifier === pkg || specifier.startsWith(`${pkg}/`);
