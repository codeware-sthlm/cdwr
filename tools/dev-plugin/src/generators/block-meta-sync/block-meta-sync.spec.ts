import { execFileSync } from 'node:child_process';

import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import blockMetaSyncGenerator from './block-meta-sync';

// Named and default both: the generator's import resolves through either
vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  const execFileSync = vi.fn();
  return { ...actual, default: { ...actual, execFileSync }, execFileSync };
});

const OUTPUT = 'libs/shared/util/payload-utils/src/lib/block-meta.ts';

// Shaped as the extractor really prints it: a label per locale, not a string
const extracted = {
  hosts: ['pages', 'content'],
  meta: {
    hero: {
      slug: 'hero',
      label: { en: 'Hero', sv: 'Hero' },
      fields: [],
      availableIn: ['pages']
    }
  }
};

describe('block-meta-sync generator', () => {
  beforeEach(() => {
    vi.mocked(execFileSync).mockReset();
    vi.mocked(execFileSync).mockReturnValue(JSON.stringify(extracted));
  });

  it('writes the module and reports it out of sync when it is missing', async () => {
    const tree = createTreeWithEmptyWorkspace();

    const result = await blockMetaSyncGenerator(tree);

    expect(result.outOfSyncMessage).toContain(OUTPUT);
    const written = tree.read(OUTPUT, 'utf-8') ?? '';
    expect(written).toContain('AUTO-GENERATED');
    expect(written).toContain("export type BlockHost = 'pages' | 'content';");
    expect(written).toContain('hero');
    expect(written).toContain("en: 'Hero'");
  });

  it('reports nothing once the module is current', async () => {
    const tree = createTreeWithEmptyWorkspace();
    await blockMetaSyncGenerator(tree);

    expect(await blockMetaSyncGenerator(tree)).toEqual({});
  });

  it('rewrites a module that has gone stale', async () => {
    const tree = createTreeWithEmptyWorkspace();
    tree.write(OUTPUT, '// stale\n');

    const result = await blockMetaSyncGenerator(tree);

    expect(result.outOfSyncMessage).toBeDefined();
    expect(tree.read(OUTPUT, 'utf-8')).not.toContain('// stale');
  });

  // An extractor that fails must not read as an empty registry
  it('surfaces the extractor stderr when it exits non-zero', async () => {
    vi.mocked(execFileSync).mockImplementation(() => {
      throw Object.assign(new Error('Command failed'), {
        stderr: 'Cannot find module'
      });
    });

    await expect(
      blockMetaSyncGenerator(createTreeWithEmptyWorkspace())
    ).rejects.toThrow(/Could not evaluate the blocks:\nCannot find module/);
  });

  it('refuses output that is not block metadata', async () => {
    vi.mocked(execFileSync).mockReturnValue('warning: something else');

    await expect(
      blockMetaSyncGenerator(createTreeWithEmptyWorkspace())
    ).rejects.toThrow(/not block metadata/);
  });
});
