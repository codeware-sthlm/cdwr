import type { ComponentProp } from '@codeware/app-cms/feature/component-builder';

import { compareComponentProps } from './compare-component-props';

type Schema = NonNullable<Parameters<typeof compareComponentProps>[1]>;

const prop = (
  name: string,
  kind: ComponentProp['kind'] = 'string',
  optional = true
): ComponentProp => ({ name, kind, optional });

const text = (
  name: string,
  overrides: Partial<Schema[number]> = {}
): Schema[number] => ({ name, type: 'text', ...overrides });

const messages = (
  code: ComponentProp[] | undefined,
  schema: Schema | null | undefined
) => compareComponentProps(code, schema).map((d) => d.message);

describe('compareComponentProps', () => {
  it('says nothing when the props could not be resolved', () => {
    expect(messages(undefined, [text('a')])).toEqual([]);
  });

  it('says nothing when code and schema agree', () => {
    expect(
      messages(
        [prop('a'), prop('n', 'number', false), prop('c', 'boolean')],
        [
          text('a'),
          { name: 'n', type: 'number', required: true },
          { name: 'c', type: 'checkbox' }
        ]
      )
    ).toEqual([]);
  });

  it('warns about an optional prop editors cannot set', () => {
    expect(messages([prop('step', 'number')], [])).toEqual([
      '`step` is not declared in Props, so editors cannot set it.'
    ]);
    expect(messages([prop('step', 'number')], null)).toHaveLength(1);
  });

  it('warns that a required undeclared prop will be undefined', () => {
    expect(messages([prop('label', 'string', false)], undefined)).toEqual([
      '`label` is required by the component but not declared in Props, so it will be undefined.'
    ]);
  });

  it('warns about a declared prop the code does not take', () => {
    expect(messages([], [text('extra')])).toEqual([
      '`extra` is declared in Props but the component does not take it, so it has no effect.'
    ]);
  });

  it.each([
    ['text', 'string', false],
    ['textarea', 'string', false],
    ['number', 'number', false],
    ['checkbox', 'boolean', false],
    ['text', 'number', true],
    ['number', 'string', true],
    ['checkbox', 'string', true],
    ['textarea', 'boolean', true]
  ] as const)('declared %s vs code %s -> mismatch %s', (type, kind, warns) => {
    const result = messages([prop('p', kind)], [{ name: 'p', type }]);
    expect(result).toHaveLength(warns ? 1 : 0);
    if (warns) {
      expect(result[0]).toContain(`declared as \`${type}\``);
    }
  });

  it('warns when a required prop is not marked required', () => {
    expect(messages([prop('a', 'string', false)], [text('a')])).toEqual([
      '`a` is required by the component but not marked required in Props, so it can be undefined.'
    ]);
  });

  it('warns that the form cannot fill in a non-primitive prop', () => {
    expect(messages([prop('items', 'other')], [text('items')])).toEqual([
      '`items` has a type the form cannot fill in. It can only supply text, numbers and checkboxes.'
    ]);
  });

  it('ties no finding to a source line', () => {
    expect(compareComponentProps([prop('a')], [])).toEqual([
      expect.objectContaining({ line: 0, column: 0, severity: 'warning' })
    ]);
  });

  it('makes a type mismatch an error', () => {
    expect(
      compareComponentProps(
        [prop('a', 'string')],
        [{ name: 'a', type: 'number' }]
      )
    ).toEqual([expect.objectContaining({ severity: 'error' })]);
  });
});
