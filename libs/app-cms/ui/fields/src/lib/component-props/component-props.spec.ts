import { describe, expect, it } from 'vitest';

import {
  type PropDeclaration,
  type PropType,
  coerceInput,
  displayText,
  isPropsObject,
  missingRequired,
  parseComponentSchema,
  parseDeclaration,
  relationId,
  siblingPath,
  siblingRelationId,
  undeclaredKeys,
  withValue
} from './component-props';

describe('siblingPath', () => {
  it.each([
    ['layout.0.props', 'layout.0.component'],
    [
      'layout.3.columns.1.content.2.props',
      'layout.3.columns.1.content.2.component'
    ],
    ['props', 'component']
  ])('%s -> %s', (path, expected) => {
    expect(siblingPath(path, 'component')).toBe(expected);
  });
});

describe('relationId', () => {
  it.each([
    [4, 4],
    ['abc', 'abc'],
    [{ id: 7, name: 'x' }, 7],
    [{ relationTo: 'custom-components', value: 9 }, 9],
    ['', null],
    [null, null],
    [undefined, null],
    [{}, null]
  ])('%j -> %j', (value, expected) => {
    expect(relationId(value)).toBe(expected);
  });
});

describe('parseDeclaration', () => {
  it('keeps a valid declaration and nulls an empty label', () => {
    expect(
      parseDeclaration({ name: 'a', type: 'number', label: '', required: true })
    ).toEqual({ name: 'a', type: 'number', label: null, required: true });
  });

  it.each([
    null,
    'x',
    [],
    { name: '', type: 'text' },
    { name: 'a', type: 'date' }
  ])('rejects %j', (value) => {
    expect(parseDeclaration(value)).toBeNull();
  });
});

describe('parseComponentSchema', () => {
  it('drops unusable declarations', () => {
    expect(
      parseComponentSchema({
        name: 'Hero',
        propsSchema: [{ name: 'a', type: 'text' }, { type: 'text' }, 3]
      })
    ).toEqual({
      name: 'Hero',
      declarations: [{ name: 'a', type: 'text', label: null, required: false }]
    });
  });

  it('treats a missing schema as no props', () => {
    expect(parseComponentSchema({ name: 'Hero', propsSchema: null })).toEqual({
      name: 'Hero',
      declarations: []
    });
  });

  it.each([null, 'x', {}, { name: 3 }])('rejects %j', (body) => {
    expect(parseComponentSchema(body)).toBeNull();
  });
});

describe('coerceInput', () => {
  it.each([
    ['text', 'hi', 'hi'],
    ['text', '', undefined],
    ['textarea', 'a\nb', 'a\nb'],
    ['textarea', '', undefined],
    ['number', '12', 12],
    ['number', '1.5', 1.5],
    ['number', '0', 0],
    ['number', '', undefined],
    ['number', 'abc', undefined],
    ['checkbox', true, true],
    ['checkbox', false, false]
  ] as const)('%s %j -> %j', (type, raw, expected) => {
    expect(coerceInput(type, raw)).toBe(expected);
  });
});

describe('withValue', () => {
  it('sets a value and keeps the others', () => {
    expect(withValue({ a: 1, gone: 'x' }, 'b', 'y')).toEqual({
      a: 1,
      gone: 'x',
      b: 'y'
    });
  });

  it('removes a key set to undefined and keeps the others', () => {
    expect(withValue({ a: 1, gone: 'x' }, 'a', undefined)).toEqual({
      gone: 'x'
    });
  });

  it('stores nothing when the last key goes', () => {
    expect(withValue({ a: 1 }, 'a', undefined)).toBeNull();
  });

  it('starts from nothing when the stored value is not an object', () => {
    expect(withValue('oops', 'a', 2)).toEqual({ a: 2 });
  });
});

describe('undeclaredKeys', () => {
  const declarations = [
    { name: 'a', type: 'text' as const },
    { name: 'b', type: 'number' as const }
  ];

  it('lists stored keys without a declaration', () => {
    expect(undeclaredKeys({ a: 1, old: 2, older: 3 }, declarations)).toEqual([
      'old',
      'older'
    ]);
  });

  it('is empty for nothing stored', () => {
    expect(undeclaredKeys(null, declarations)).toEqual([]);
  });
});

describe('displayText', () => {
  it.each([
    ['a', 'a'],
    [3, '3'],
    [0, '0'],
    [true, ''],
    [undefined, '']
  ])('%j -> %j', (value, expected) => {
    expect(displayText(value)).toBe(expected);
  });
});

describe('isPropsObject', () => {
  it.each([
    [null, true],
    [undefined, true],
    [{}, true],
    [{ a: 1 }, true],
    [[], false],
    ['x', false],
    [3, false]
  ])('%j -> %j', (value, expected) => {
    expect(isPropsObject(value)).toBe(expected);
  });
});

describe('missingRequired', () => {
  const required = (
    type: PropType,
    name = 'p',
    label?: string
  ): PropDeclaration => ({ name, type, required: true, label });

  it.each([
    ['text', undefined, true],
    ['text', '', true],
    ['text', 'x', false],
    ['text', 3, true],
    ['textarea', undefined, true],
    ['textarea', '', true],
    ['textarea', 'x', false],
    ['number', undefined, true],
    ['number', '5', true],
    ['number', Number.NaN, true],
    ['number', Number.POSITIVE_INFINITY, true],
    ['number', 0, false],
    ['number', 5, false],
    ['checkbox', undefined, false],
    ['checkbox', false, false],
    ['checkbox', true, false]
  ] as const)('%s with %j -> missing %s', (type, value, missing) => {
    expect(missingRequired({ p: value }, [required(type)])).toEqual(
      missing ? ['p'] : []
    );
  });

  it('uses the label when there is one', () => {
    expect(missingRequired(null, [required('text', 'a', 'Title')])).toEqual([
      'Title'
    ]);
  });

  it('ignores props that are not required', () => {
    expect(
      missingRequired({}, [{ name: 'a', type: 'text', required: false }])
    ).toEqual([]);
    expect(missingRequired({}, [{ name: 'a', type: 'text' }])).toEqual([]);
  });

  it('lists every missing prop in declaration order', () => {
    expect(
      missingRequired({ b: 'ok' }, [
        required('text', 'a'),
        required('text', 'b'),
        required('number', 'c')
      ])
    ).toEqual(['a', 'c']);
  });
});

describe('siblingRelationId', () => {
  it.each([
    [{ component: 4 }, 4],
    [{ component: { id: 7 } }, 7],
    [{ component: null }, null],
    [{}, null],
    [undefined, null]
  ])('%j -> %s', (sibling, expected) => {
    expect(siblingRelationId(sibling, 'component')).toBe(expected);
  });
});
