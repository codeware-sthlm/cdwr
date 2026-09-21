import type { BlockDefinition } from '@codeware/shared/util/seed';

/**
 * Turns the `lookup*` references in a block into the ids just created.
 *
 * Resolved **per block type** rather than by walking for anything shaped like a
 * reference. `lookupSlug` means a tag on one block and a reusable-content
 * document on another, so a generic walker would have to guess, and would guess
 * silently. Eight blocks carry references and the list is closed — being
 * explicit costs a switch and removes the guessing.
 */
export type ReferenceResolver = {
  media: (filename: string) => number | undefined;
  tag: (slug: string) => number | undefined;
  form: (title: string) => number | undefined;
  reusableContent: (slug: string) => number | undefined;
};

/** What could not be resolved, so a caller can refuse rather than drop it. */
export type UnresolvedReference = {
  blockType: string;
  field: string;
  lookup: string;
};

type AnyBlock = Record<string, unknown>;

const lookupValue = (value: unknown, key: string): string | undefined => {
  if (!value || typeof value !== 'object') {
    return undefined;
  }
  const held = (value as Record<string, unknown>)[key];
  return typeof held === 'string' ? held : undefined;
};

/**
 * Resolves one block's references.
 *
 * @param block - The block as the definition states it
 * @param resolver - How to turn each kind of reference into an id
 * @param unresolved - Collects what could not be found, in order
 * @returns The block with ids in place of references
 */
export function resolveBlockReferences(
  block: BlockDefinition,
  resolver: ReferenceResolver,
  unresolved: Array<UnresolvedReference> = []
): AnyBlock {
  const source = block as AnyBlock;
  const blockType = String(source['blockType']);

  /** Replaces one field, recording it when the reference leads nowhere. */
  const swap = (
    field: string,
    lookupKey: string,
    find: (value: string) => number | undefined
  ): AnyBlock => {
    const lookup = lookupValue(source[field], lookupKey);

    // A field the definition left out stays left out
    if (lookup === undefined) {
      return {};
    }

    const id = find(lookup);
    if (id === undefined) {
      unresolved.push({ blockType, field, lookup });
      return {};
    }

    return { [field]: id };
  };

  switch (blockType) {
    case 'hero':
    case 'feature-section':
    case 'image':
      return {
        ...source,
        ...swap('media', 'lookupFilename', resolver.media)
      };

    case 'callout':
      return {
        ...source,
        ...swap('image', 'lookupFilename', resolver.media)
      };

    case 'form':
      return { ...source, ...swap('form', 'lookupTitle', resolver.form) };

    case 'reusable-content':
      return {
        ...source,
        ...swap('reusableContent', 'lookupSlug', resolver.reusableContent)
      };

    case 'testimonial':
      return {
        ...source,
        ...swap('avatar', 'lookupFilename', resolver.media),
        ...swap('logo', 'lookupFilename', resolver.media)
      };

    case 'file-area': {
      const tags = Array.isArray(source['tags']) ? source['tags'] : undefined;

      return {
        ...source,
        ...swap('media', 'lookupFilename', resolver.media),
        ...(tags
          ? {
              tags: tags.flatMap((tag) => {
                const lookup = lookupValue(tag, 'lookupSlug');
                const id =
                  lookup === undefined ? undefined : resolver.tag(lookup);

                if (id === undefined) {
                  unresolved.push({
                    blockType,
                    field: 'tags',
                    lookup: lookup ?? '(not a reference)'
                  });
                  return [];
                }
                return [id];
              })
            }
          : {})
      };
    }

    // The other twelve blocks point at nothing, so there is nothing to resolve
    default:
      return source;
  }
}
