import { convertMarkdownToLexical } from '@codeware/app-cms/util/content-templates';
import type { Payload } from 'payload';

/**
 * Turns the markdown a definition states into the Lexical Payload stores.
 *
 * Kept apart from `resolveBlockReferences` on purpose. That one is a pure
 * lookup against documents this run already created, and being synchronous is
 * what keeps it easy to test. This needs `payload.config` and is asynchronous,
 * so mixing them would make every reference test await something it does not
 * care about.
 *
 * Two blocks carry rich text: `content` in its columns, and `form` in the
 * intro above the fields. Nothing else does.
 *
 * @param payload - Payload instance, for the editor config the conversion needs
 * @param block - One layout block, as the definition states it
 * @returns The same block with any markdown converted
 */
export async function resolveRichText<TBlock>(
  payload: Payload,
  block: TBlock
): Promise<TBlock> {
  const candidate = block as unknown as {
    blockType?: string;
    introContent?: { markdown?: unknown } | null;
    columns?: Array<{ richText?: { markdown?: unknown } | null }> | null;
  };

  if (candidate.blockType === 'form') {
    const markdown = candidate.introContent?.markdown;

    if (typeof markdown !== 'string') {
      return block;
    }

    return {
      ...candidate,
      introContent: await convertMarkdownToLexical(payload.config, markdown)
    } as unknown as TBlock;
  }

  if (candidate.blockType !== 'content' || !candidate.columns) {
    return block;
  }

  const columns = await Promise.all(
    candidate.columns.map(async (column) => {
      const markdown = column?.richText?.markdown;

      if (typeof markdown !== 'string') {
        return column;
      }

      return {
        ...column,
        richText: await convertMarkdownToLexical(payload.config, markdown)
      };
    })
  );

  return { ...candidate, columns } as unknown as TBlock;
}
