import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

// The desk image builds from a context that holds only the libs Dockerfile.dockerignore lets in,
// and desk-image.yml builds it only when one of its paths changes. Typecheck and tests resolve
// every import through tsconfig.base.json, so a lib missing from either passes here and breaks
// the image after the merge. This follows the desk's @codeware imports, through the libs they
// reach, and asks for each lib in both lists.

const root = fileURLToPath(new URL('../../../', import.meta.url));
const read = (path: string) => readFileSync(join(root, path), 'utf8');

const paths = (
  JSON.parse(read('tsconfig.base.json')) as {
    compilerOptions: { paths: Record<string, string[]> };
  }
).compilerOptions.paths;

/** The lib folder an alias points into, such as libs/shared/util/ui */
const libOf = (specifier: string): string | null => {
  for (const [alias, [target]] of Object.entries(paths)) {
    const hit = alias.endsWith('/*')
      ? specifier.startsWith(alias.slice(0, -1))
      : specifier === alias;
    if (!hit || !target) continue;
    const file = target.replace(/^\.\//, '');
    if (!file.includes('/src/')) {
      throw new Error(`${alias} points at ${file}, outside a lib's src folder`);
    }
    return file.split('/src/')[0];
  }
  return null;
};

/** The lib folder a repo path sits in, such as libs/shared/ui/shadcn */
const libAt = (path: string): string | null =>
  /^libs\/.+?(?=\/src(\/|$))/.exec(path)?.[0] ?? null;

/** The source files under a folder, specs and stories left out: the build reaches neither */
const sources = (dir: string): string[] =>
  readdirSync(join(root, dir), { recursive: true, encoding: 'utf8' })
    .filter(
      (f) =>
        /\.(ts|tsx|mts|js|css)$/.test(f) && !/\.(spec|test|stories)\./.test(f)
    )
    .map((f) => join(dir, f));

/** The libs a file reaches: its @codeware imports, and the lib folders a stylesheet's @source names */
const libsOf = (file: string): string[] => {
  const text = read(file);
  const imports = [
    ...text.matchAll(
      /(?:\bfrom|\bimport|@import)\s*\(?\s*['"](@codeware\/[^'"]+)['"]/g
    )
  ].map((m) => libOf(m[1]));
  const sourced = [...text.matchAll(/@source\s+['"]([^'"]+)['"]/g)].map((m) =>
    libAt(relative(root, join(root, dirname(file), m[1])))
  );
  return [...imports, ...sourced].filter((lib): lib is string => lib !== null);
};

/** Every lib the desk reaches, directly or through another lib */
const reached = (): string[] => {
  const libs = new Set<string>();
  const queue = sources('apps/desk/src');
  while (queue.length) {
    for (const lib of libsOf(queue.pop() as string)) {
      if (!libs.has(lib)) {
        libs.add(lib);
        queue.push(...sources(`${lib}/src`));
      }
    }
  }
  return [...libs].sort();
};

describe('the desk image build context', () => {
  const libs = reached();

  it('reaches the libs it renders with', () => {
    expect(libs).toContain('libs/shared/ui/shadcn');
  });

  it('lets every reached lib into the Docker build context', () => {
    const ignore = read('apps/desk/Dockerfile.dockerignore').split('\n');
    const missing = libs.filter((lib) => !ignore.includes(`!/${lib}/src`));
    expect(missing, 'add !/<lib>/src to Dockerfile.dockerignore').toEqual([]);
  });

  it('builds the image when a reached lib changes', () => {
    const workflow = read('.github/workflows/desk-image.yml');
    const missing = libs.filter((lib) => !workflow.includes(`"${lib}/**"`));
    expect(missing, 'add "<lib>/**" to the desk-image.yml paths').toEqual([]);
  });
});
