import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

import { tenantCollectionSlugs } from '@codeware/app-cms/util/definitions';
import type { CollectionConfig } from 'payload';

/**
 * Invariants across the registered collections.
 *
 * Read from source rather than by importing the collections: they pull in
 * Payload's ESM-only lexical editor, which would mean transpiling half of
 * `node_modules` to answer questions the text already answers.
 *
 * These cover pairings that only fail once a real request is made, where the
 * symptom is a 500 or a silently empty field rather than a test failure.
 */

const collectionsDir = __dirname;

/** Access helpers whose `Where` names the `tenant` field */
const tenantScopedHelpers = ['userOrApiKeyAccess', 'userOnlyAccess'];

const operations = [
  'create',
  'delete',
  'read',
  'update'
] as const satisfies ReadonlyArray<
  keyof NonNullable<CollectionConfig['access']>
>;

/**
 * Drop comments so prose about a helper is not mistaken for a call.
 *
 * The `[^:]` guard keeps `https://` intact.
 */
const stripComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

type CollectionSource = {
  /** Directory name under `collections/` */
  dir: string;
  slug: string;
  source: string;
};

const readCollections = (): Array<CollectionSource> =>
  readdirSync(collectionsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => {
      const dir = join(collectionsDir, entry.name);
      const file = readdirSync(dir).find((name) =>
        /\.collection\.tsx?$/.test(name)
      );

      if (!file) {
        return [];
      }

      const source = stripComments(readFileSync(join(dir, file), 'utf8'));
      const slug = /^\s*slug: '([^']+)'/m.exec(source)?.[1];

      if (!slug) {
        throw new Error(`No slug found in ${entry.name}/${file}`);
      }

      return [{ dir: entry.name, slug, source }];
    });

const collections = readCollections();

const barrel = readFileSync(join(collectionsDir, 'index.ts'), 'utf8');

describe('collections', () => {
  it('finds the collection sources', () => {
    expect(collections.length).toBeGreaterThan(0);
  });

  it('registers every collection in the barrel', () => {
    // A collection missing here is never added to the config, and the only
    // symptom is that its admin views and endpoints are absent
    const missing = collections
      .filter(({ dir }) => !barrel.includes(`from './${dir}/`))
      .map(({ dir }) => dir);

    expect(missing).toEqual([]);
  });

  it('has a unique slug per collection', () => {
    const slugs = collections.map(({ slug }) => slug);
    expect(slugs).toHaveLength(new Set(slugs).size);
  });

  describe('access control', () => {
    it('scopes by tenant only where a tenant field exists', () => {
      // A tenant-scoped helper returns a `Where` naming the `tenant` field. On
      // a collection the multi-tenant plugin never touched there is no such
      // field, and Payload answers with "Cannot find field for path at
      // tenant" — a 500 rather than a denial, which no cross-tenant assertion
      // would notice
      const tenantSlugs = new Set<string>(tenantCollectionSlugs);

      const mismatched = collections
        .filter(
          ({ slug, source }) =>
            !tenantSlugs.has(slug) &&
            tenantScopedHelpers.some((helper) => source.includes(helper))
        )
        .map(({ slug }) => slug);

      expect(mismatched).toEqual([]);
    });

    it('filters members-only content wherever it can exist', () => {
      // The public site renders as the tenant api key, which is a member of no
      // workspace. A collection carrying `visibility` but not passing
      // `hasVisibility` to its read helper serves restricted documents to
      // anyone — it fails open, and silently
      const unfiltered = collections
        .filter(
          ({ source }) =>
            source.includes('visibilityField()') &&
            !source.includes('hasVisibility: true')
        )
        .map(({ slug }) => slug);

      expect(unfiltered).toEqual([]);
    });

    it('leaves no operation on the Payload default', () => {
      // Payload defaults an unset operation to "any authenticated user", which
      // for a tenant api key means every tenant's documents (COD-425)
      const incomplete = collections
        .map(({ slug, source }) => {
          const block = /\n {2}access: \{([\s\S]*?)\n {2}\},/.exec(source)?.[1];
          const missing = operations.filter(
            (operation) => !block?.includes(`${operation}:`)
          );
          return { slug, missing };
        })
        .filter(({ missing }) => missing.length);

      expect(incomplete).toEqual([]);
    });
  });
});
