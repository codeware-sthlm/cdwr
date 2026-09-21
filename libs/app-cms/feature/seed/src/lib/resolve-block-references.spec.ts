import type { BlockDefinition } from '@codeware/shared/util/seed';

import {
  type ReferenceResolver,
  type UnresolvedReference,
  resolveBlockReferences
} from './resolve-block-references';

/** Knows about one of each kind, and nothing else. */
const resolver: ReferenceResolver = {
  media: (filename) => (filename === 'hero.jpg' ? 11 : undefined),
  tag: (slug) => (slug === 'reports' ? 22 : undefined),
  form: (title) => (title === 'Contact' ? 33 : undefined),
  reusableContent: (slug) => (slug === 'shared' ? 44 : undefined)
};

const resolve = (block: unknown) => {
  const unresolved: Array<UnresolvedReference> = [];
  const resolved = resolveBlockReferences(
    block as BlockDefinition,
    resolver,
    unresolved
  );
  return { resolved, unresolved };
};

describe('resolveBlockReferences', () => {
  it.each([
    ['hero', 'media'],
    ['feature-section', 'media'],
    ['image', 'media']
  ])('resolves %s.%s', (blockType, field) => {
    const { resolved, unresolved } = resolve({
      blockType,
      [field]: { lookupFilename: 'hero.jpg' }
    });

    expect(resolved[field]).toBe(11);
    expect(unresolved).toEqual([]);
  });

  it('resolves the callout image, which is not called media', () => {
    const { resolved } = resolve({
      blockType: 'callout',
      image: { lookupFilename: 'hero.jpg' }
    });

    expect(resolved['image']).toBe(11);
  });

  it('resolves both testimonial images independently', () => {
    const { resolved, unresolved } = resolve({
      blockType: 'testimonial',
      avatar: { lookupFilename: 'hero.jpg' },
      logo: { lookupFilename: 'absent.png' }
    });

    expect(resolved['avatar']).toBe(11);
    // The one that failed is reported; the one that worked still resolved
    expect(unresolved).toEqual([
      { blockType: 'testimonial', field: 'logo', lookup: 'absent.png' }
    ]);
  });

  it('resolves a form by title', () => {
    const { resolved } = resolve({
      blockType: 'form',
      form: { lookupTitle: 'Contact' }
    });

    expect(resolved['form']).toBe(33);
  });

  it('resolves reusable content by slug', () => {
    const { resolved } = resolve({
      blockType: 'reusable-content',
      reusableContent: { lookupSlug: 'shared' }
    });

    expect(resolved['reusableContent']).toBe(44);
  });

  it('resolves a file area, which has both a media and a list of tags', () => {
    const { resolved } = resolve({
      blockType: 'file-area',
      media: { lookupFilename: 'hero.jpg' },
      tags: [{ lookupSlug: 'reports' }]
    });

    expect(resolved).toMatchObject({ media: 11, tags: [22] });
  });

  it('drops a tag it cannot resolve, and says which', () => {
    const { resolved, unresolved } = resolve({
      blockType: 'file-area',
      tags: [{ lookupSlug: 'reports' }, { lookupSlug: 'absent' }]
    });

    expect(resolved['tags']).toEqual([22]);
    expect(unresolved).toEqual([
      { blockType: 'file-area', field: 'tags', lookup: 'absent' }
    ]);
  });

  it('reports rather than silently dropping an unresolved reference', () => {
    // The whole point: a page shipping without its image, and nothing saying so
    const { resolved, unresolved } = resolve({
      blockType: 'hero',
      heading: 'Still here',
      media: { lookupFilename: 'absent.png' }
    });

    expect(resolved).toMatchObject({ heading: 'Still here' });
    expect(resolved['media']).toEqual({ lookupFilename: 'absent.png' });
    expect(unresolved).toEqual([
      { blockType: 'hero', field: 'media', lookup: 'absent.png' }
    ]);
  });

  it('leaves a field the definition omitted omitted', () => {
    const { resolved, unresolved } = resolve({
      blockType: 'hero',
      heading: 'No image'
    });

    expect(resolved).toEqual({ blockType: 'hero', heading: 'No image' });
    expect(unresolved).toEqual([]);
  });

  it.each(['content', 'code', 'posts', 'tours', 'spacing', 'card'])(
    'passes %s through untouched, having nothing to resolve',
    (blockType) => {
      const block = { blockType, anything: { lookupSlug: 'reports' } };
      const { resolved, unresolved } = resolve(block);

      expect(resolved).toEqual(block);
      expect(unresolved).toEqual([]);
    }
  );
});
