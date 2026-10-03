import type {
  Navigation,
  Page,
  Post
} from '@codeware/shared/util/payload-types';
import { describe, expect, it } from 'vitest';

import { resolveNavigationTree } from './resolve-navigation-tree';

type Items = NonNullable<Navigation['items']>;

const page = { id: 1, name: 'About', slug: 'about' } as Page;
const post = { id: 2, title: 'News', slug: 'news' } as Post;

const pageRef = { relationTo: 'pages', value: page } as const;
const postRef = { relationTo: 'posts', value: post } as const;

/**
 * Build navigation data for the fields `resolveNavigationTree` reads.
 */
const makeNavigation = (items: Items): Navigation[] =>
  [{ items }] as Navigation[];

describe('resolveNavigationTree', () => {
  it('returns an empty tree without navigation', () => {
    expect(resolveNavigationTree([])).toEqual([]);
  });

  it('resolves flat links with the document name and url', () => {
    const tree = resolveNavigationTree(
      makeNavigation([
        { id: 'a', type: 'link', reference: pageRef },
        { id: 'b', type: 'link', reference: postRef, appearance: 'button' }
      ])
    );

    expect(tree).toEqual([
      {
        kind: 'link',
        appearance: 'link',
        collection: 'pages',
        key: 'a',
        label: 'About',
        url: '/about'
      },
      {
        kind: 'link',
        appearance: 'button',
        collection: 'posts',
        key: 'b',
        label: 'News',
        url: '/posts/news'
      }
    ]);
  });

  it('prefers a custom label when the source is custom', () => {
    const [link] = resolveNavigationTree(
      makeNavigation([
        {
          id: 'a',
          reference: pageRef,
          labelSource: 'custom',
          customLabel: 'Who we are'
        }
      ])
    );

    expect(link).toMatchObject({ label: 'Who we are' });
  });

  it('falls back to the document name when the custom label is empty', () => {
    const [link] = resolveNavigationTree(
      makeNavigation([
        { id: 'a', reference: pageRef, labelSource: 'custom', customLabel: '' }
      ])
    );

    expect(link).toMatchObject({ label: 'About' });
  });

  it('drops a link whose document is gone or not populated', () => {
    const tree = resolveNavigationTree(
      makeNavigation([
        { id: 'a', reference: null },
        { id: 'b', reference: { relationTo: 'pages', value: 3 } },
        { id: 'c', reference: pageRef }
      ])
    );

    expect(tree.map(({ key }) => key)).toEqual(['c']);
  });

  it('resolves a group with its links', () => {
    const tree = resolveNavigationTree(
      makeNavigation([
        {
          id: 'g',
          type: 'group',
          label: 'Company',
          children: [
            { id: 'c1', reference: pageRef },
            {
              id: 'c2',
              reference: postRef,
              labelSource: 'custom',
              customLabel: 'Latest'
            }
          ]
        }
      ])
    );

    expect(tree).toEqual([
      {
        kind: 'group',
        key: 'g',
        label: 'Company',
        children: [
          {
            kind: 'link',
            appearance: 'link',
            collection: 'pages',
            key: 'c1',
            label: 'About',
            url: '/about'
          },
          {
            kind: 'link',
            appearance: 'link',
            collection: 'posts',
            key: 'c2',
            label: 'Latest',
            url: '/posts/news'
          }
        ]
      }
    ]);
  });

  it('drops dangling children and a group left without any', () => {
    const tree = resolveNavigationTree(
      makeNavigation([
        {
          id: 'g1',
          type: 'group',
          label: 'Empty',
          children: [{ id: 'c1', reference: { relationTo: 'pages', value: 3 } }]
        },
        { id: 'g2', type: 'group', label: 'None' },
        {
          id: 'g3',
          type: 'group',
          label: 'Some',
          children: [
            { id: 'c2', reference: { relationTo: 'pages', value: 3 } },
            { id: 'c3', reference: pageRef }
          ]
        }
      ])
    );

    expect(tree).toHaveLength(1);
    expect(tree[0]).toMatchObject({
      kind: 'group',
      key: 'g3',
      children: [{ key: 'c3' }]
    });
  });

  it('treats an item without a type as a link', () => {
    const [item] = resolveNavigationTree(
      makeNavigation([{ id: 'a', reference: pageRef }])
    );

    expect(item).toMatchObject({ kind: 'link', url: '/about' });
  });
});
