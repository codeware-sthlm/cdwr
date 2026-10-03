import path from 'node:path';

import ts from 'typescript';

import { extractProps } from './extract-props';
import type { ComponentDiagnostic, ComponentProp, HostModule } from './types';

const VIRTUAL_NAME = '__cdwr_component__.tsx';

export const OPTIONS = {
  strict: true,
  jsx: ts.JsxEmit.ReactJSX,
  noEmit: true,
  skipLibCheck: true,
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  lib: ['lib.es2022.d.ts', 'lib.dom.d.ts', 'lib.dom.iterable.d.ts'],
  types: []
} as const satisfies ts.CompilerOptions;

/** The path aliases of the workspace, so the kit's own imports resolve. */
export const workspacePaths = (workspaceRoot: string): ts.CompilerOptions => {
  const file = path.join(workspaceRoot, 'tsconfig.base.json');
  if (!ts.sys.fileExists(file)) {
    return {};
  }
  const { config } = ts.readConfigFile(file, ts.sys.readFile);
  const { options } = ts.parseJsonConfigFileContent(
    config,
    ts.sys,
    workspaceRoot
  );
  return options.paths
    ? { paths: options.paths, pathsBasePath: options['pathsBasePath'] }
    : {};
};

const extensionOf = (file: string): ts.Extension =>
  file.endsWith('.d.ts')
    ? ts.Extension.Dts
    : file.endsWith('.tsx')
      ? ts.Extension.Tsx
      : ts.Extension.Ts;

/**
 * A compiler host that serves `sourceFile` from memory and resolves the host
 * modules through their types entries.
 */
export const createProgramHost = (
  options: ts.CompilerOptions,
  hostModules: Readonly<Record<string, HostModule>>,
  sourceFile: ts.SourceFile
): ts.CompilerHost => {
  const virtualPath = sourceFile.fileName;
  const host = ts.createCompilerHost(options);
  const { getSourceFile, fileExists, readFile } = host;

  host.getSourceFile = (fileName, ...rest) =>
    fileName === virtualPath
      ? sourceFile
      : getSourceFile.call(host, fileName, ...rest);
  host.fileExists = (fileName) =>
    fileName === virtualPath || fileExists.call(host, fileName);
  host.readFile = (fileName) =>
    fileName === virtualPath ? sourceFile.text : readFile.call(host, fileName);
  host.resolveModuleNameLiterals = (
    literals,
    containingFile,
    _redirect,
    opts
  ) =>
    literals.map((literal) => {
      const typesEntry = hostModules[literal.text]?.typesEntry;
      if (typesEntry) {
        return {
          resolvedModule: {
            resolvedFileName: typesEntry,
            extension: extensionOf(typesEntry)
          }
        };
      }
      return ts.resolveModuleName(literal.text, containingFile, opts, host);
    });
  return host;
};

const severityOf = (category: ts.DiagnosticCategory) =>
  category === ts.DiagnosticCategory.Error ? 'error' : 'warning';

export type TypecheckResult = {
  diagnostics: ComponentDiagnostic[];
  /** The default export's props; undefined when they cannot be resolved */
  props?: ComponentProp[];
};

/** Type-checks the source in memory, as if it lived in `workspaceRoot`. */
export const typecheck = (
  source: string,
  workspaceRoot: string,
  hostModules: Readonly<Record<string, HostModule>>
): TypecheckResult => {
  const virtualPath = path.join(workspaceRoot, VIRTUAL_NAME);
  const sourceFile = ts.createSourceFile(
    virtualPath,
    source,
    ts.ScriptTarget.ES2022,
    true,
    ts.ScriptKind.TSX
  );
  const options: ts.CompilerOptions = {
    ...OPTIONS,
    ...workspacePaths(workspaceRoot)
  };
  const host = createProgramHost(options, hostModules, sourceFile);

  const program = ts.createProgram([virtualPath], options, host);
  const own = program.getSourceFile(virtualPath);
  if (!own) {
    return { diagnostics: [] };
  }

  const diagnostics: ComponentDiagnostic[] = [
    ...program.getSyntacticDiagnostics(own),
    ...program.getSemanticDiagnostics(own)
  ].map((d) => {
    const { line, character } =
      d.file && d.start !== undefined
        ? d.file.getLineAndCharacterOfPosition(d.start)
        : { line: 0, character: 0 };
    return {
      message: ts.flattenDiagnosticMessageText(d.messageText, '\n'),
      line: line + 1,
      column: character + 1,
      severity: severityOf(d.category)
    };
  });

  const checker = program.getTypeChecker();
  const moduleSymbol = checker.getSymbolAtLocation(own);
  if (
    !moduleSymbol ||
    !checker.tryGetMemberInModuleExports('default', moduleSymbol)
  ) {
    diagnostics.push({
      message: 'The source must `export default` a React component',
      line: 1,
      column: 1,
      severity: 'error'
    });
  }

  const hasErrors = diagnostics.some((d) => d.severity === 'error');
  return {
    diagnostics,
    props:
      hasErrors || !moduleSymbol
        ? undefined
        : extractProps(checker, moduleSymbol, own)
  };
};
