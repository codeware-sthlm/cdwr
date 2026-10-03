import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { HOST_MODULE_SPECIFIERS } from '@codeware/shared/util/payload-utils';
import ts from 'typescript';

import { DEFAULT_BUNDLED_PACKAGES } from './host-modules';
import type { ComponentToolchain } from './toolchain';
import { OPTIONS, createProgramHost, workspacePaths } from './typecheck';

const STUB_NAME = '__cdwr_editor_types__.ts';
const NODE_MODULES = '/node_modules/';
const WORKSPACE_DIR = 'workspace';
const PACKAGE_FIELDS = [
  'name',
  'version',
  'types',
  'typings',
  'main',
  'typesVersions'
] as const;

export type EditorTypes = {
  /** A content hash that names the set, in logs and when comparing two builds */
  version: string;
  /** Virtual path → file content */
  files: Record<string, string>;
  /** Module specifier → virtual paths, the way tsconfig `paths` are written, relative to the virtual root */
  paths: Record<string, string[]>;
};

const posix = (file: string) => file.split(path.sep).join('/');

const stripDeclaration = (file: string) => file.replace(/\.d\.ts$/, '');

const stripExtension = (file: string) =>
  stripDeclaration(file).replace(/\.[cm]?[jt]sx?$/, '');

/** Splits a path inside `node_modules` into its package name and package dir. */
const packageOf = (file: string) => {
  const at = file.lastIndexOf(NODE_MODULES);
  const inside = file.slice(at + NODE_MODULES.length);
  const segments = inside.split('/');
  const name = (
    inside.startsWith('@') ? segments.slice(0, 2) : segments.slice(0, 1)
  ).join('/');
  return {
    name,
    inside,
    dir: file.slice(0, at + NODE_MODULES.length) + name
  };
};

/** The fields of a package manifest that module resolution reads. */
const resolutionManifest = (manifestPath: string): string | undefined => {
  if (!existsSync(manifestPath)) {
    return undefined;
  }
  const manifest: Record<string, unknown> = JSON.parse(
    readFileSync(manifestPath, 'utf8')
  );
  return JSON.stringify(
    Object.fromEntries(
      PACKAGE_FIELDS.filter((field) => field in manifest).map((field) => [
        field,
        manifest[field]
      ])
    ),
    null,
    2
  );
};

/** The module specifiers a declaration file imports or re-exports. */
const specifiersOf = (declaration: string): string[] => {
  const found = new Set<string>();
  const sf = ts.createSourceFile(
    'x.d.ts',
    declaration,
    ts.ScriptTarget.ES2022,
    true
  );
  const visit = (node: ts.Node) => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      found.add(node.moduleSpecifier.text);
    } else if (
      ts.isImportTypeNode(node) &&
      ts.isLiteralTypeNode(node.argument) &&
      ts.isStringLiteral(node.argument.literal)
    ) {
      found.add(node.argument.literal.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return [...found];
};

/**
 * Whether a file names a path under the workspace root. Only the root's own
 * children count: the bare root is a false match on a short one such as the
 * image's `/app`, which docs links in the package declarations contain.
 */
export const leaksRoot = (content: string, root: string): boolean =>
  [`${root}/node_modules/`, `${root}/libs/`, `${root}/apps/`].some((dir) =>
    content.includes(dir)
  );

const isBare = (specifier: string) =>
  !specifier.startsWith('.') && !path.isAbsolute(specifier);

const format = (diagnostics: readonly ts.Diagnostic[]) =>
  ts.formatDiagnostics(diagnostics, {
    getCanonicalFileName: (f) => f,
    getCurrentDirectory: () => '',
    getNewLine: () => '\n'
  });

/**
 * Declaration files the admin editor needs to check a custom component the way
 * the server build does: the host modules, the bundled packages and the site
 * kit, with the workspace sources reduced to their declarations.
 *
 * Throws when a declaration cannot be emitted or would leak a machine path, so
 * a broken set fails the build rather than shipping.
 */
export const collectEditorTypes = ({
  root,
  kit
}: Pick<ComponentToolchain, 'root' | 'kit'>): EditorTypes => {
  const stubPath = path.join(root, STUB_NAME);
  const stub = ts.createSourceFile(
    stubPath,
    [...HOST_MODULE_SPECIFIERS, ...DEFAULT_BUNDLED_PACKAGES]
      .map((specifier) => `import '${specifier}';`)
      .join('\n'),
    ts.ScriptTarget.ES2022,
    true,
    ts.ScriptKind.TS
  );
  const options: ts.CompilerOptions = {
    ...OPTIONS,
    ...workspacePaths(root),
    declaration: true,
    emitDeclarationOnly: true,
    noEmit: false
  };
  const host = createProgramHost(
    options,
    { '@site/ui': { typesEntry: kit } },
    stub
  );
  const program = ts.createProgram([stubPath], options, host);

  const files: Record<string, string> = {};
  const add = (key: string, content: string) => {
    const existing = files[key];
    if (existing !== undefined && existing !== content) {
      throw new Error(`Two different files claim ${key}`);
    }
    files[key] = content;
  };
  /** Workspace source file → its virtual declaration path, without extension */
  const virtualOf = new Map<string, string>();
  /** Every collected file → its key, and the text its imports are read from */
  const collected = new Map<string, { key: string; text: string }>();
  const workspaceKey = (file: string) =>
    `${WORKSPACE_DIR}/${posix(path.relative(root, stripExtension(file)))}`;

  for (const sf of program.getSourceFiles()) {
    const file = sf.fileName;
    if (file === stubPath || program.isSourceFileDefaultLibrary(sf)) {
      continue;
    }

    if (file.includes(NODE_MODULES)) {
      const pkg = packageOf(file);
      add(`node_modules/${pkg.inside}`, sf.text);
      collected.set(file, { key: `node_modules/${pkg.inside}`, text: sf.text });
      const manifest = resolutionManifest(path.join(pkg.dir, 'package.json'));
      if (manifest) {
        add(`node_modules/${pkg.name}/package.json`, manifest);
      }
      continue;
    }

    const key = workspaceKey(file);
    virtualOf.set(file, key);
    if (file.endsWith('.d.ts')) {
      add(`${key}.d.ts`, sf.text);
      collected.set(file, { key: `${key}.d.ts`, text: sf.text });
      continue;
    }

    let declaration: string | undefined;
    const result = program.emit(
      sf,
      (name, text) => {
        if (name.endsWith('.d.ts')) {
          declaration = text;
        }
      },
      undefined,
      true
    );
    if (result.diagnostics.length > 0) {
      throw new Error(
        `Declarations for ${path.relative(root, file)} failed:\n${format(result.diagnostics)}`
      );
    }
    if (declaration === undefined) {
      throw new Error(
        `No declaration was emitted for ${path.relative(root, file)}`
      );
    }
    add(`${key}.d.ts`, declaration);
    collected.set(file, { key: `${key}.d.ts`, text: declaration });
  }

  const paths: Record<string, string[]> = {};
  const kitKey = virtualOf.get(kit);
  if (!kitKey) {
    throw new Error(`The kit ${kit} is not part of the program`);
  }
  paths['@site/ui'] = [kitKey];

  // The editor resolves the way node does, without `exports`: a specifier the
  // program reached through `exports` needs a path of its own.
  const classic: ts.ModuleResolutionHost = {
    fileExists: (file) => file.slice(1) in files,
    readFile: (file) => files[file.slice(1)],
    directoryExists: () => true
  };
  // TypeScript caches parsed `paths` per object, so each lookup gets a copy
  const classicOptions = (): ts.CompilerOptions => ({
    moduleResolution: ts.ModuleResolutionKind.NodeJs,
    baseUrl: '/',
    paths: { ...paths }
  });
  for (const [file, { text }] of collected) {
    for (const specifier of specifiersOf(text).filter(isBare)) {
      if (specifier in paths) {
        continue;
      }
      const resolved = ts.resolveModuleName(specifier, file, options, host)
        .resolvedModule?.resolvedFileName;
      const target = resolved && collected.get(resolved)?.key;
      if (!target) {
        continue;
      }
      const editor = ts.resolveModuleName(
        specifier,
        `/${collected.get(file)?.key}`,
        classicOptions(),
        classic
      ).resolvedModule?.resolvedFileName;
      if (editor !== `/${target}`) {
        paths[specifier] = [
          virtualOf.has(resolved) ? stripDeclaration(target) : target
        ];
      }
    }
  }

  for (const [key, content] of Object.entries(files)) {
    const leaked = key.startsWith(`${WORKSPACE_DIR}/`)
      ? /\/Users\/|[A-Z]:\\/.test(content) || leaksRoot(content, root)
      : leaksRoot(content, root);
    if (leaked) {
      throw new Error(`${key} carries a machine path`);
    }
  }

  const hash = createHash('sha256');
  for (const key of Object.keys(files).sort()) {
    hash
      .update(key)
      .update('\0')
      .update(files[key] ?? '')
      .update('\0');
  }

  return {
    version: hash.digest('hex').slice(0, 16),
    files,
    paths: { ...paths }
  };
};
