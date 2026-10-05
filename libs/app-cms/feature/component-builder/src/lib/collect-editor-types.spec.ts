/**
 * Integration test: the collected types, alone, type-check a real component.
 *
 * Needs the workspace toolchain (typescript, the packages and the UI kit), so
 * it runs only in a checkout.
 */
import path from 'node:path';

import { cdwrIo, moon } from '@codeware/shared/util/seed/site-definitions';
import ts from 'typescript';

import {
  type EditorTypes,
  collectEditorTypes,
  leaksRoot
} from './collect-editor-types';
import { resolveToolchain } from './toolchain';

const resolved = resolveToolchain({ cwd: import.meta.dirname });
if (!resolved.ok) {
  throw new Error(resolved.reason);
}
const { toolchain } = resolved;

const metricCardSource = moon.customComponents?.find(
  (c) => c.slug === 'metric-card'
)?.source;
if (!metricCardSource) {
  throw new Error('The Moon seed has no metric card');
}

const themeSwatchSource = cdwrIo.customComponents?.find(
  (c) => c.slug === 'theme-swatch'
)?.source;
if (!themeSwatchSource) {
  throw new Error('The cdwr.io seed has no theme swatch');
}

const ROOT = '/';

/** Type-checks `source` against nothing but the collected files. */
const check = ({ files, paths }: EditorTypes, source: string) => {
  const options: ts.CompilerOptions = {
    strict: true,
    jsx: ts.JsxEmit.ReactJSX,
    moduleResolution: ts.ModuleResolutionKind.NodeJs,
    baseUrl: ROOT,
    paths: { ...paths },
    skipLibCheck: true,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    lib: ['lib.es2022.d.ts', 'lib.dom.d.ts', 'lib.dom.iterable.d.ts'],
    types: []
  };
  const virtual = new Map(
    Object.entries(files).map(([key, text]) => [`${ROOT}${key}`, text])
  );
  virtual.set('/component.tsx', source);

  const host = ts.createCompilerHost(options);
  host.fileExists = (file) => virtual.has(file) || ts.sys.fileExists(file);
  host.readFile = (file) => virtual.get(file) ?? ts.sys.readFile(file);
  host.directoryExists = () => true;
  host.getCurrentDirectory = () => ROOT;
  const real = host.getSourceFile;
  host.getSourceFile = (file, languageVersion, ...rest) => {
    const text = virtual.get(file);
    return text === undefined
      ? real.call(host, file, languageVersion, ...rest)
      : ts.createSourceFile(file, text, languageVersion, true);
  };

  const program = ts.createProgram(['/component.tsx'], options, host);
  const own = program.getSourceFile('/component.tsx');
  if (!own) {
    throw new Error('The component was not part of the program');
  }
  return [
    ...program.getSyntacticDiagnostics(own),
    ...program.getSemanticDiagnostics(own)
  ].map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n'));
};

describe('collectEditorTypes (integration)', () => {
  let types: EditorTypes;

  beforeAll(() => {
    types = collectEditorTypes(toolchain);
    const bytes = Object.values(types.files).reduce((n, f) => n + f.length, 0);
    console.info(
      `editor types: ${Object.keys(types.files).length} files, ${bytes} bytes, version ${types.version}`
    );
  }, 120_000);

  it('carries the host, bundled and kit declarations', () => {
    const keys = Object.keys(types.files);
    expect(keys).toEqual(
      expect.arrayContaining([
        'node_modules/@types/react/index.d.ts',
        'node_modules/@types/react/jsx-runtime.d.ts',
        'node_modules/lucide-react/package.json'
      ])
    );
    expect(keys.some((k) => k.startsWith('node_modules/recharts/'))).toBe(true);
    expect(keys.some((k) => k.startsWith('node_modules/zod/'))).toBe(true);
    expect(keys.some((k) => /^workspace\/.*kit\.d\.ts$/.test(k))).toBe(true);
    expect(types.paths['@site/ui']).toBeDefined();
  });

  it('carries no machine path', () => {
    const root = path.resolve(toolchain.root);
    for (const [key, content] of Object.entries(types.files)) {
      expect(key).not.toContain(root);
      expect(content).not.toContain(root);
    }
  });

  it('is not fooled by a docs link that happens to start like a short root', () => {
    expect(leaksRoot('see https://x.dev/docs/appearance', '/app')).toBe(false);
    expect(leaksRoot('import("/app/libs/shared/x")', '/app')).toBe(true);
    expect(leaksRoot('/app/node_modules/react/index', '/app')).toBe(true);
  });

  it('keeps only the manifest fields resolution needs', () => {
    const manifest = JSON.parse(
      types.files['node_modules/lucide-react/package.json'] ?? '{}'
    );
    expect(
      Object.keys(manifest).every((k) =>
        [
          'name',
          'version',
          'types',
          'typings',
          'main',
          'typesVersions'
        ].includes(k)
      )
    ).toBe(true);
  });

  it('type-checks the Moon metric card from the files alone', () => {
    expect(check(types, metricCardSource)).toEqual([]);
  }, 60_000);

  it('type-checks the cdwr.io theme swatch from the files alone', () => {
    expect(check(types, themeSwatchSource)).toEqual([]);
  }, 60_000);

  it('reports a type error', () => {
    expect(check(types, `export const n: number = 'x';`)).not.toEqual([]);
  }, 60_000);

  it('reports a wrong kit prop and a missing kit export', () => {
    const wrongProp = `import { Button } from '@site/ui';
export default () => <Button variant={1} />;`;
    const missing = `import { Nope } from '@site/ui';
export default () => <Nope />;`;
    expect(check(types, wrongProp)).not.toEqual([]);
    expect(check(types, missing)).not.toEqual([]);
  }, 60_000);
});
