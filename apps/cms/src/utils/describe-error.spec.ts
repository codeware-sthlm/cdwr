import { describeError } from './describe-error';

/** An error without a stack, so assertions read on the message alone. */
const bare = (message: string, options?: ErrorOptions) => {
  const error = new Error(message, options);
  error.stack = undefined;
  return error;
};

describe('describeError', () => {
  it('describes a plain error', () => {
    expect(describeError(bare('boom'))).toEqual(['Error: boom']);
  });

  it('follows the cause chain, which is the whole point', () => {
    // The shape a failing migration actually arrives in: Drizzle's wrapper
    // outside, the driver's reason inside
    const cause = bare('could not extend file: No space left on device');
    const error = bare('Failed query: create table "pages"', { cause });

    expect(describeError(error)).toEqual([
      'Error: Failed query: create table "pages"',
      'caused by: Error: could not extend file: No space left on device'
    ]);
  });

  it('surfaces the postgres detail fields', () => {
    const error = Object.assign(bare('insert failed'), {
      code: '25006',
      detail: 'cannot execute INSERT in a read-only transaction',
      hint: '',
      constraint: 'tenants_slug_key'
    });

    expect(describeError(error)).toEqual([
      'Error: insert failed',
      '  code: 25006',
      '  detail: cannot execute INSERT in a read-only transaction',
      // `hint` is empty and is left out rather than printed blank
      '  constraint: tenants_slug_key'
    ]);
  });

  it('prefers the stack when there is one', () => {
    const error = new Error('boom');
    error.stack = 'Error: boom\n    at somewhere';

    expect(describeError(error)[0]).toBe('Error: boom\n    at somewhere');
  });

  it('stops on a chain that points back at itself', () => {
    const error = bare('loops');
    error.cause = error;

    expect(describeError(error)).toEqual([
      'Error: loops',
      'caused by: (already shown above)'
    ]);
  });

  it('says when it stopped early rather than implying the chain ended', () => {
    let error = bare('deepest');
    for (let i = 0; i < 8; i++) {
      error = bare(`wrapper ${i}`, { cause: error });
    }

    const lines = describeError(error);

    expect(lines).toHaveLength(6);
    expect(lines.at(-1)).toBe('caused by: (further causes not shown)');
  });

  it('handles something thrown that is not an error at all', () => {
    expect(describeError('just a string')).toEqual(['just a string']);
    expect(describeError(bare('wrapped', { cause: 42 }))).toEqual([
      'Error: wrapped',
      'caused by: 42'
    ]);
  });

  it('returns nothing for no error', () => {
    expect(describeError(null)).toEqual([]);
    expect(describeError(undefined)).toEqual([]);
  });
});
