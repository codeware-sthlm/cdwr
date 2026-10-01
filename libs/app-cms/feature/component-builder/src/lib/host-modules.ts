import type { HostModule } from './types';

export const DEFAULT_HOST_MODULES = {
  react: {},
  'react-dom': {},
  'react-dom/client': {},
  'react/jsx-runtime': {},
  '@site/ui': {}
} as const satisfies Record<string, HostModule>;

export const DEFAULT_BUNDLED_PACKAGES = [
  'lucide-react',
  'class-variance-authority',
  'react-hook-form',
  'zod',
  'recharts'
] as const;

/** Global the host page fills with its module instances. */
export const HOST_REGISTRY_GLOBAL = '__cdwrHost';

export const hostShim = (specifier: string): string =>
  `module.exports = globalThis.${HOST_REGISTRY_GLOBAL}[${JSON.stringify(specifier)}];`;

/** True when `specifier` is `pkg` or a subpath of `pkg`. */
export const matchesPackage = (specifier: string, pkg: string): boolean =>
  specifier === pkg || specifier.startsWith(`${pkg}/`);
