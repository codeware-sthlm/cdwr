import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { resolveToolchain } from './toolchain';

const FILES = [
  'pnpm-workspace.yaml',
  'tsconfig.base.json',
  'libs/shared/ui/cms-renderer/src/lib/blocks/custom-component/kit.ts',
  'libs/shared/theme/src/lib/_core/site-base.css',
  'node_modules/.keep'
];

const makeWorkspace = (omit: string[] = []) => {
  const root = mkdtempSync(path.join(tmpdir(), 'toolchain-'));
  for (const file of FILES.filter((f) => !omit.includes(f))) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), '');
  }
  mkdirSync(path.join(root, 'apps/cms'), { recursive: true });
  return root;
};

describe('resolveToolchain', () => {
  const roots: string[] = [];
  const workspace = (omit?: string[]) => {
    const root = makeWorkspace(omit);
    roots.push(root);
    return root;
  };

  afterAll(() => {
    for (const root of roots) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('walks up from the working directory to the workspace marker', () => {
    const root = workspace();
    const result = resolveToolchain({ cwd: path.join(root, 'apps/cms') });

    expect(result).toEqual({
      ok: true,
      toolchain: {
        root,
        kit: path.join(
          root,
          'libs/shared/ui/cms-renderer/src/lib/blocks/custom-component/kit.ts'
        ),
        themeCss: path.join(
          root,
          'libs/shared/theme/src/lib/_core/site-base.css'
        )
      }
    });
  });

  it('prefers an explicit root over the working directory', () => {
    const root = workspace();
    const elsewhere = workspace(['tsconfig.base.json']);

    expect(
      resolveToolchain({ override: root, cwd: path.join(elsewhere, 'apps') })
    ).toMatchObject({ ok: true, toolchain: { root } });
  });

  it('says what is missing from the workspace', () => {
    const root = workspace(['node_modules/.keep']);
    const result = resolveToolchain({ cwd: root });

    expect(result).toEqual({
      ok: false,
      reason: expect.stringContaining('node_modules')
    });
  });

  it('reports no workspace instead of throwing', () => {
    const lonely = mkdtempSync(path.join(tmpdir(), 'no-workspace-'));
    roots.push(lonely);

    const result = resolveToolchain({ cwd: lonely });
    // A stray marker above the temp dir would make this a different failure
    expect(result.ok).toBe(false);
  });
});
