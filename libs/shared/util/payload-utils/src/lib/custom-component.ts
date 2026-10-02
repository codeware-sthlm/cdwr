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

/** What building one component comes to: its bundle, or what went wrong */
export type ComponentBuildResult =
  | {
      ok: true;
      js: string;
      css: string;
      hash: string;
      /** Warnings from the type-check */
      diagnostics: ComponentDiagnostic[];
      /** Undefined when the props could not be resolved */
      props?: ComponentProp[];
    }
  | { ok: false; diagnostics: ComponentDiagnostic[] };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isDiagnostic = (value: unknown): value is ComponentDiagnostic =>
  isRecord(value) &&
  typeof value['message'] === 'string' &&
  typeof value['line'] === 'number' &&
  typeof value['column'] === 'number' &&
  (value['severity'] === 'error' || value['severity'] === 'warning');

const propKinds = {
  string: true,
  number: true,
  boolean: true,
  other: true
} as const satisfies Record<ComponentPropKind, true>;

const isProp = (value: unknown): value is ComponentProp =>
  isRecord(value) &&
  typeof value['name'] === 'string' &&
  typeof value['kind'] === 'string' &&
  Object.hasOwn(propKinds, value['kind']) &&
  typeof value['optional'] === 'boolean';

/** Checks untyped JSON, such as a build service's answer, for the result shape. */
export const isComponentBuildResult = (
  value: unknown
): value is ComponentBuildResult => {
  if (!isRecord(value) || !Array.isArray(value['diagnostics'])) {
    return false;
  }
  if (!value['diagnostics'].every(isDiagnostic)) {
    return false;
  }
  if (value['ok'] === false) {
    return true;
  }
  const { props } = value;
  return (
    value['ok'] === true &&
    typeof value['js'] === 'string' &&
    typeof value['css'] === 'string' &&
    typeof value['hash'] === 'string' &&
    COMPONENT_HASH_PATTERN.test(value['hash']) &&
    (props === undefined || (Array.isArray(props) && props.every(isProp)))
  );
};
