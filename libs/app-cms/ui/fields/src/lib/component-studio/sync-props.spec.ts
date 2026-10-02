import { describe, expect, it } from 'vitest';

import {
  type PropDeclaration,
  mergeProps,
  readPropsSchema,
  toSyncOutcome
} from './sync-props';

const row = (
  name: string,
  type: PropDeclaration['type'],
  required = false,
  label?: string
): PropDeclaration => ({ name, type, required, label, id: `id-${name}` });

describe('mergeProps', () => {
  it('reports a list that already matches', () => {
    const merge = mergeProps(
      [row('title', 'text', true), row('open', 'checkbox')],
      [
        { name: 'title', kind: 'string', optional: false },
        { name: 'open', kind: 'boolean', optional: true }
      ]
    );

    expect(merge.changed).toBe(false);
    expect(merge.removeAt).toEqual([]);
    expect(merge.rows.map(({ from }) => from)).toEqual([0, 1]);
  });

  it('keeps a textarea for a string prop', () => {
    const merge = mergeProps(
      [row('body', 'textarea', true)],
      [{ name: 'body', kind: 'string', optional: false }]
    );

    expect(merge.changed).toBe(false);
    expect(merge.rows[0]?.type).toBe('textarea');
  });

  it('keeps the label', () => {
    const merge = mergeProps(
      [row('title', 'text', false, 'Heading')],
      [{ name: 'title', kind: 'string', optional: true }]
    );

    expect(merge.rows[0]?.label).toBe('Heading');
  });

  it.each([
    ['number', 'string', 'text'],
    ['text', 'number', 'number'],
    ['textarea', 'boolean', 'checkbox'],
    ['checkbox', 'string', 'text']
  ] as const)('corrects a %s row for a %s prop to %s', (from, kind, to) => {
    const merge = mergeProps(
      [row('a', from)],
      [{ name: 'a', kind, optional: true }]
    );

    expect(merge.rows[0]?.type).toBe(to);
    expect(merge.updated).toEqual(['a']);
    expect(merge.changed).toBe(true);
  });

  it('makes required follow the code', () => {
    const merge = mergeProps(
      [row('a', 'text', true), row('b', 'text', false)],
      [
        { name: 'a', kind: 'string', optional: true },
        { name: 'b', kind: 'string', optional: false }
      ]
    );

    expect(merge.rows.map(({ required }) => required)).toEqual([false, true]);
    expect(merge.updated).toEqual(['a', 'b']);
    expect(merge.changed).toBe(true);
  });

  it('adds missing props at the end', () => {
    const merge = mergeProps(
      [row('a', 'text')],
      [
        { name: 'a', kind: 'string', optional: true },
        { name: 'count', kind: 'number', optional: false }
      ]
    );

    expect(merge.rows[1]).toEqual({
      name: 'count',
      label: null,
      type: 'number',
      required: true,
      from: null
    });
    expect(merge.added).toEqual(['count']);
    expect(merge.changed).toBe(true);
  });

  it('removes rows the code does not take', () => {
    const merge = mergeProps(
      [row('gone', 'text'), row('a', 'text')],
      [{ name: 'a', kind: 'string', optional: true }]
    );

    expect(merge.removeAt).toEqual([0]);
    expect(merge.removed).toEqual(['gone']);
    expect(merge.rows.map(({ name }) => name)).toEqual(['a']);
    expect(merge.changed).toBe(true);
  });

  it('removes a repeated name after the first', () => {
    const merge = mergeProps(
      [row('a', 'text'), row('a', 'number')],
      [{ name: 'a', kind: 'string', optional: true }]
    );

    expect(merge.removeAt).toEqual([1]);
  });

  it('adds a list to an empty one', () => {
    const merge = mergeProps(
      [],
      [{ name: 'a', kind: 'string', optional: true }]
    );

    expect(merge.rows).toHaveLength(1);
    expect(merge.changed).toBe(true);
  });

  it('reports props of another type and does not add them', () => {
    const merge = mergeProps(
      [],
      [{ name: 'items', kind: 'other', optional: true }]
    );

    expect(merge.rows).toEqual([]);
    expect(merge.skipped).toEqual(['items']);
    expect(merge.changed).toBe(false);
  });

  it('leaves an existing row for a prop of another type as it is', () => {
    const merge = mergeProps(
      [row('items', 'text', true)],
      [{ name: 'items', kind: 'other', optional: true }]
    );

    expect(merge.rows[0]).toMatchObject({ type: 'text', required: true });
    expect(merge.skipped).toEqual(['items']);
    expect(merge.changed).toBe(false);
  });

  it('empties the list when the code takes nothing', () => {
    const merge = mergeProps([row('a', 'text')], []);

    expect(merge.removeAt).toEqual([0]);
    expect(merge.removed).toEqual(['a']);
    expect(merge.rows).toEqual([]);
  });
});

describe('readPropsSchema', () => {
  it('reads rows and drops what is not one', () => {
    expect(
      readPropsSchema([
        { id: 'x', name: 'a', label: 'A', type: 'text', required: true },
        { name: 'b', type: 'date' },
        null,
        'c',
        { name: 'd', type: 'number' }
      ])
    ).toEqual([
      { name: 'a', label: 'A', type: 'text', required: true },
      { name: 'd', label: null, type: 'number', required: false }
    ]);
  });

  it('reads anything but a list as empty', () => {
    expect(readPropsSchema(undefined)).toEqual([]);
    expect(readPropsSchema({})).toEqual([]);
  });
});

describe('toSyncOutcome', () => {
  it('names what changed and what was skipped', () => {
    const merge = mergeProps(
      [row('gone', 'text'), row('n', 'text', false)],
      [
        { name: 'n', kind: 'number', optional: false },
        { name: 'fresh', kind: 'boolean', optional: true },
        { name: 'items', kind: 'other', optional: true }
      ]
    );

    expect(toSyncOutcome(merge)).toEqual({
      status: 'changed',
      added: ['fresh'],
      removed: ['gone'],
      updated: ['n'],
      skipped: ['items']
    });
  });

  it('is unchanged when only skipped props differ', () => {
    const merge = mergeProps(
      [],
      [{ name: 'items', kind: 'other', optional: true }]
    );

    expect(toSyncOutcome(merge)).toEqual({
      status: 'unchanged',
      skipped: ['items']
    });
  });
});
