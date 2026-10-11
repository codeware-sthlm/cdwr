import { posix } from 'node:path';

import type { Tree } from '@nx/devkit';
import type { SyncGeneratorResult } from 'nx/src/utils/sync-generators';

import { BLOCK_IMAGES } from './layouts';
import { renderIcon, renderThumbnail } from './render';

const OUTPUT_DIR = 'apps/cms/public/blocks';

/** Every file the layouts produce, by path */
function render(): Map<string, string> {
  const files = new Map<string, string>();

  for (const [slug, { thumbnail, icon }] of Object.entries(BLOCK_IMAGES)) {
    files.set(
      posix.join(OUTPUT_DIR, `${slug}.svg`),
      renderThumbnail(thumbnail)
    );
    files.set(posix.join(OUTPUT_DIR, `${slug}.icon.svg`), renderIcon(icon));
  }

  return files;
}

/**
 * Regenerate the block images the admin shows.
 *
 * Payload's block drawer takes an image URL, and an `<img>` cannot follow the
 * admin's theme, so every image is drawn in one mid-grey that reads on both.
 * The layouts are plain data next to this file, which keeps the output
 * deterministic and lets `nx sync --check` catch a hand-edited image.
 */
export async function blockImagesSyncGenerator(
  tree: Tree
): Promise<SyncGeneratorResult> {
  const files = render();
  const stale: Array<string> = [];

  for (const [path, content] of files) {
    if (tree.read(path, 'utf-8') !== content) {
      tree.write(path, content);
      stale.push(path);
    }
  }

  // An image whose block is gone
  const existing = tree.exists(OUTPUT_DIR) ? tree.children(OUTPUT_DIR) : [];
  for (const name of existing) {
    const path = posix.join(OUTPUT_DIR, name);
    if (name.endsWith('.svg') && !files.has(path)) {
      tree.delete(path);
      stale.push(path);
    }
  }

  if (stale.length === 0) {
    return {};
  }

  return {
    outOfSyncMessage: `'${OUTPUT_DIR}' is out of date with the block layouts (${stale.length} images, starting with ${posix.basename(stale[0])}).`
  };
}

export default blockImagesSyncGenerator;
