import { isComponentBuildResult } from './custom-component';
import {
  MAX_COMPONENT_SOURCE_LENGTH,
  parseComponentSource
} from './parse-component-source';

describe('parseComponentSource', () => {
  it('reads a source without props', () => {
    expect(parseComponentSource({ source: 'x' })).toEqual({ source: 'x' });
  });

  it('accepts a source at the size limit only', () => {
    const at = 'x'.repeat(MAX_COMPONENT_SOURCE_LENGTH);
    expect(parseComponentSource({ source: at })).toEqual({ source: at });
    expect(parseComponentSource({ source: `${at}x` })).toEqual(
      expect.stringContaining('larger than')
    );
  });

  it('drops declarations whose name is not a prop name yet', () => {
    expect(
      parseComponentSource({
        source: 'x',
        propsSchema: [
          { name: 'label', type: 'text', required: true },
          { name: '', type: 'text' },
          { name: 'Not-ok', type: 'number' }
        ]
      })
    ).toEqual({
      source: 'x',
      propsSchema: [{ name: 'label', type: 'text', required: true }]
    });
  });

  it.each([
    ['a body that is not an object', 'x'],
    ['an array', []],
    ['a source that is not text', { source: 3 }],
    ['props that are not a list', { source: 'x', propsSchema: {} }],
    [
      'a prop of an unknown type',
      { source: 'x', propsSchema: [{ name: 'a', type: 'date' }] }
    ],
    ['a prop without a name', { source: 'x', propsSchema: [{ type: 'text' }] }]
  ])('refuses %s', (_name, body) => {
    expect(typeof parseComponentSource(body)).toBe('string');
  });
});

describe('isComponentBuildResult', () => {
  const diagnostic = { message: 'm', line: 1, column: 1, severity: 'error' };
  const ok = {
    ok: true,
    js: 'j',
    css: 'c',
    hash: '0123456789abcdef',
    diagnostics: []
  };

  it.each([
    ['a failed build', { ok: false, diagnostics: [diagnostic] }],
    ['a built component', ok],
    [
      'a built component with props',
      { ...ok, props: [{ name: 'a', kind: 'string', optional: false }] }
    ]
  ])('accepts %s', (_name, value) => {
    expect(isComponentBuildResult(value)).toBe(true);
  });

  it.each([
    ['null', null],
    ['an error body', { error: 'Unauthorized' }],
    ['a result without diagnostics', { ok: false }],
    ['a built result without js', { ...ok, js: undefined }],
    ['a hash of the wrong shape', { ...ok, hash: 'abc' }],
    [
      'a severity that does not exist',
      { ok: false, diagnostics: [{ ...diagnostic, severity: 'info' }] }
    ],
    [
      'a prop of an unknown kind',
      { ...ok, props: [{ name: 'a', kind: 'date', optional: true }] }
    ]
  ])('rejects %s', (_name, value) => {
    expect(isComponentBuildResult(value)).toBe(false);
  });
});
