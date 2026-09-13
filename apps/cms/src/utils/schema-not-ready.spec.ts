import { isSchemaNotReady } from './schema-not-ready';

const pgError = (code: string) => Object.assign(new Error('pg'), { code });

describe('isSchemaNotReady', () => {
  it.each(['42P01', '42703'])('recognises Postgres code %s', (code) => {
    expect(isSchemaNotReady(pgError(code))).toBe(true);
  });

  it('finds the code behind the adapter wrapping it', () => {
    const wrapped = new Error('Failed query: select ...', {
      cause: pgError('42703')
    });

    expect(isSchemaNotReady(wrapped)).toBe(true);
  });

  it.each([
    ['a connection refusal', pgError('ECONNREFUSED')],
    ['a permission error', pgError('42501')],
    ['an error without a code', new Error('boom')],
    ['a string', 'boom'],
    ['nothing', undefined]
  ])('does not excuse %s', (_label, error) => {
    expect(isSchemaNotReady(error)).toBe(false);
  });
});
