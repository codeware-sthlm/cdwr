import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import { describe, expect, it } from 'vitest';

import blockImagesSyncGenerator from './block-images-sync';
import { BLOCK_IMAGES } from './layouts';
import { COLOR } from './render';

const DIR = 'apps/cms/public/blocks';

const slugs = Object.keys(BLOCK_IMAGES);

describe('block-images-sync generator', () => {
  it('writes every image and reports it out of sync when they are missing', async () => {
    const tree = createTreeWithEmptyWorkspace();

    const result = await blockImagesSyncGenerator(tree);

    expect(result?.outOfSyncMessage).toContain(DIR);
    for (const slug of slugs) {
      expect(tree.exists(`${DIR}/${slug}.svg`)).toBe(true);
      expect(tree.exists(`${DIR}/${slug}.icon.svg`)).toBe(true);
    }
  });

  it('reports nothing once the images are current', async () => {
    const tree = createTreeWithEmptyWorkspace();
    await blockImagesSyncGenerator(tree);

    expect(await blockImagesSyncGenerator(tree)).toEqual({});
  });

  it('rewrites an image that has gone stale', async () => {
    const tree = createTreeWithEmptyWorkspace();
    await blockImagesSyncGenerator(tree);
    tree.write(`${DIR}/hero.svg`, '<svg/>');

    const result = await blockImagesSyncGenerator(tree);

    expect(result?.outOfSyncMessage).toContain('hero.svg');
    expect(tree.read(`${DIR}/hero.svg`, 'utf-8')).toContain('viewBox');
  });

  it('removes an image no block produces', async () => {
    const tree = createTreeWithEmptyWorkspace();
    await blockImagesSyncGenerator(tree);
    tree.write(`${DIR}/gone.svg`, '<svg/>');

    const result = await blockImagesSyncGenerator(tree);

    expect(result?.outOfSyncMessage).toContain('gone.svg');
    expect(tree.exists(`${DIR}/gone.svg`)).toBe(false);
  });

  it('draws thumbnails in 480 x 320 and icons in 24 x 24', async () => {
    const tree = createTreeWithEmptyWorkspace();
    await blockImagesSyncGenerator(tree);

    for (const slug of slugs) {
      expect(tree.read(`${DIR}/${slug}.svg`, 'utf-8')).toContain(
        'viewBox="0 0 480 320"'
      );
      expect(tree.read(`${DIR}/${slug}.icon.svg`, 'utf-8')).toContain(
        'viewBox="0 0 24 24"'
      );
    }
  });

  it('uses one colour only, which is what lets them read in both themes', async () => {
    const tree = createTreeWithEmptyWorkspace();
    await blockImagesSyncGenerator(tree);

    for (const name of tree.children(DIR)) {
      const svg = tree.read(`${DIR}/${name}`, 'utf-8') ?? '';
      const colours = new Set(svg.match(/#[0-9a-f]{3,8}/gi));

      expect(colours, name).toEqual(new Set([COLOR]));
      expect(svg, name).not.toContain('rgb(');
      expect(svg.endsWith('\n'), name).toBe(true);
    }
  });

  it('draws no path with a doubled sign', async () => {
    const tree = createTreeWithEmptyWorkspace();
    await blockImagesSyncGenerator(tree);

    for (const name of tree.children(DIR)) {
      expect(tree.read(`${DIR}/${name}`, 'utf-8'), name).not.toMatch(/--/);
    }
  });
});
