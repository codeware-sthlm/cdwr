import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

import { type Tree, workspaceRoot } from '@nx/devkit';
import type { SyncGeneratorResult } from 'nx/src/utils/sync-generators';
import { format, resolveConfig } from 'prettier';

const OUTPUT = 'libs/shared/util/payload-utils/src/lib/block-meta.ts';

const EXTRACTOR = 'apps/cms/src/utils/extract-block-meta.ts';

type Extracted = {
  hosts: Array<string>;
  meta: Record<string, unknown>;
};

/**
 * Read the registered blocks by evaluating them in a `tsx` process.
 *
 * Nx loads a generator without the workspace's path aliases, so the blocks
 * cannot be imported from here — the extractor lives in `apps/cms`, which is
 * the project allowed to reach them. A child process is the cost of describing
 * what the admin actually renders rather than what the source appears to say.
 */
function extract(): Extracted {
  // The binary directly rather than through `pnpm`: a package-manager shim
  // resolved differently under Nx's sync runner and returned nothing at all,
  // which reads as an empty registry rather than as a failure
  const tsx = join(workspaceRoot, 'node_modules/.bin/tsx');
  let stdout: string;

  try {
    stdout = execFileSync(
      tsx,
      ['--tsconfig', 'tsconfig.base.json', EXTRACTOR],
      {
        cwd: workspaceRoot,
        encoding: 'utf-8',
        maxBuffer: 32 * 1024 * 1024,
        stdio: ['ignore', 'pipe', 'pipe']
      }
    );
  } catch (error) {
    const { stderr, message } = error as { stderr?: string; message: string };
    throw new Error(`Could not evaluate the blocks:\n${stderr || message}`);
  }

  try {
    return JSON.parse(stdout.trim()) as Extracted;
  } catch {
    throw new Error(
      `'${EXTRACTOR}' printed something that is not block metadata:\n${stdout}`
    );
  }
}

function render({ hosts, meta }: Extracted): string {
  return `/* AUTO-GENERATED — do not edit manually. Run \`pnpm nx sync\` to update. */

import type { BlockSlug } from '@codeware/shared/util/payload-types';

/** What a definition says, per locale. \`en\` is always written. */
export type LocalizedText = Record<string, string>;

/** One field an editor fills in, as the admin presents it. */
export type BlockFieldMeta = {
  name: string;
  type: string;
  required?: boolean;
  /** Shown only when a sibling field says so, so \`required\` applies then */
  conditional?: boolean;
  localized?: boolean;
  label?: LocalizedText;
  description?: LocalizedText;
  /** For a blocks field: the slugs it accepts */
  blocks?: Array<string>;
  /** For a group or an array, the fields inside it */
  fields?: Array<BlockFieldMeta>;
};

/**
 * A layout field that offers blocks.
 *
 * \`posts\` and \`tours\` are absent on purpose: they gate their blocks inside a
 * Lexical editor config, which cannot be read from the block definitions.
 */
export type BlockHost = ${hosts.map((host) => `'${host}'`).join(' | ')};

export type BlockMeta = {
  slug: BlockSlug;
  label: LocalizedText;
  /** Empty means registered and rendered, but not offered anywhere */
  availableIn: Array<BlockHost>;
  fields: Array<BlockFieldMeta>;
};

/**
 * Every registered block, and what an editor fills in for it.
 *
 * Keyed by \`BlockSlug\`, so a block registered in Payload without an entry
 * here stops the build — the same guarantee \`blocksMap\` gives the renderer.
 * \`nx sync --check\` is what keeps the values current.
 */
export const BLOCK_META: Record<BlockSlug, BlockMeta> = ${JSON.stringify(
    meta,
    null,
    2
  )};
`;
}

/**
 * Regenerate the block metadata the gallery reads.
 *
 * The definitions live in `app-cms`, which `scope:shared` may not import — and
 * would not want to, since every one of them pulls Payload's field helpers and
 * Lexical into whatever bundles it. So the shape is evaluated at sync time and
 * committed as plain data.
 */
export async function blockMetaSyncGenerator(
  tree: Tree
): Promise<SyncGeneratorResult> {
  const config = await resolveConfig(join(workspaceRoot, OUTPUT));
  const formatted = await format(render(extract()), {
    ...config,
    parser: 'typescript'
  });

  if (tree.read(OUTPUT, 'utf-8') === formatted) {
    return {};
  }

  tree.write(OUTPUT, formatted);

  return {
    outOfSyncMessage: `'${OUTPUT}' is out of date with the registered blocks.`
  };
}

export default blockMetaSyncGenerator;
