import { execFileSync } from 'child_process';
import { join, resolve } from 'path';

/**
 * The generator's spec stubs this extractor, so a wrong reading of the blocks
 * would still sync cleanly and commit wrong metadata. This runs the real one,
 * the way the generator does, and pins what the gallery depends on it for.
 */

type Field = {
  name: string;
  type: string;
  fields?: Array<Field>;
  blocks?: Array<string>;
};

type Extracted = {
  hosts: Array<string>;
  meta: Record<string, { availableIn: Array<string>; fields: Array<Field> }>;
};

const root = resolve(__dirname, '../../../..');

const everyField = (fields: Array<Field>): Array<Field> =>
  fields.flatMap((field) => [field, ...everyField(field.fields ?? [])]);

describe('extract-block-meta', () => {
  let extracted: Extracted;

  beforeAll(() => {
    extracted = JSON.parse(
      execFileSync(
        join(root, 'node_modules/.bin/tsx'),
        [
          '--tsconfig',
          'tsconfig.base.json',
          'apps/cms/src/utils/extract-block-meta.ts'
        ],
        { cwd: root, encoding: 'utf-8', maxBuffer: 32 * 1024 * 1024 }
      )
    );
  }, 120_000);

  it('reads every host that names its blocks', () => {
    expect(extracted.hosts).toEqual(['pages', 'reusable-content', 'content']);
  });

  // Evaluated, not parsed: a helper call is the fields the admin shows
  it('expands a field helper into the fields it produces', () => {
    const link = extracted.meta['callout'].fields.find(
      ({ name }) => name === 'link'
    );

    expect(link?.fields?.map(({ name }) => name)).toEqual(
      expect.arrayContaining(['type', 'url', 'label'])
    );
  });

  it('lists what a nested blocks field accepts', () => {
    const nested = everyField(extracted.meta['content'].fields).find(
      ({ type }) => type === 'blocks'
    );

    expect(nested?.blocks).toEqual(expect.arrayContaining(['code']));
  });

  it('reports a block that no host offers as available nowhere', () => {
    expect(extracted.meta['media'].availableIn).toEqual([]);
  });

  it('lifts admin layout containers out of the field shape', () => {
    const types = Object.values(extracted.meta).flatMap(({ fields }) =>
      everyField(fields).map(({ type }) => type)
    );

    for (const container of ['row', 'collapsible', 'tabs', 'ui']) {
      expect(types).not.toContain(container);
    }
  });
});
