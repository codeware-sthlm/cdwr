/** Prefix of a custom component's element tag name, followed by its slug */
export const COMPONENT_TAG_PREFIX = 'cdwr-x-';

/** Global the host page fills with its module instances */
export const HOST_REGISTRY_GLOBAL = '__cdwrHost';

/** Modules a component reads from the host page instead of bundling */
export const HOST_MODULE_SPECIFIERS = [
  'react',
  'react-dom',
  'react-dom/client',
  'react/jsx-runtime',
  '@site/ui'
] as const;

export type HostModuleSpecifier = (typeof HOST_MODULE_SPECIFIERS)[number];

/** Packages bundled into each component instead of read from the host page */
export const DEFAULT_BUNDLED_PACKAGES = [
  'lucide-react',
  'class-variance-authority',
  'react-hook-form',
  'zod',
  'recharts'
] as const;

/** One finding of a component build */
export type ComponentDiagnostic = {
  message: string;
  /** 1-based line in the authored source; 1 when no location is known */
  line: number;
  /** 1-based column in the authored source; 1 when no location is known */
  column: number;
  severity: 'error' | 'warning';
};

export type ComponentPropKind = 'string' | 'number' | 'boolean' | 'other';

/** One prop the component's default export takes */
export type ComponentProp = {
  name: string;
  kind: ComponentPropKind;
  optional: boolean;
};

/** Characters of the content hash that names a built bundle */
export const COMPONENT_HASH_LENGTH = 16;

/** What a bundle's content hash looks like */
export const COMPONENT_HASH_PATTERN = new RegExp(
  `^[0-9a-f]{${COMPONENT_HASH_LENGTH}}$`
);

/** Element tag name of the component with this slug */
export const componentTagName = (slug: string): string =>
  `${COMPONENT_TAG_PREFIX}${slug}`;

/** Path, from the CMS origin, that serves the bundle with this hash */
export const componentBundlePath = (hash: string): string =>
  `/api/custom-components/bundle/${hash}.js`;
