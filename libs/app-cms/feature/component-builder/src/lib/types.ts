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

export type BuildComponentResult =
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

/** A module the host page provides at runtime instead of the bundle. */
export type HostModule = {
  /** Types entry file used for type-checking; omit to resolve from node_modules */
  typesEntry?: string;
};

export type BuildComponentOptions = {
  /** The component's custom-element name, e.g. `acme-chart` */
  tagName: string;
  /** TSX source that `export default`s a React component */
  source: string;
  /** Absolute path to the stylesheet carrying the site theme */
  themeCss: string;
  /** Directory bundled packages and types resolve from; defaults to cwd */
  workspaceRoot?: string;
  /** Modules provided by the host page, keyed by import specifier */
  hostModules?: Readonly<Record<string, HostModule>>;
  /** Packages bundled into each component */
  bundledPackages?: readonly string[];
};
