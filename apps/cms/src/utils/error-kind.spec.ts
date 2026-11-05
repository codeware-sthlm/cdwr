import { errorKind } from './error-kind';

describe('errorKind', () => {
  it('names the class and never the message', () => {
    // The shape Drizzle throws: the submitted values sit in the message
    const error = new TypeError(
      'Failed query: insert into "users" params: visitor@example.com'
    );

    expect(errorKind(error)).toBe('TypeError');
  });

  it('adds the code when the error carries one', () => {
    const error = Object.assign(
      new Error('Key (email)=(visitor@example.com)'),
      {
        code: '23505'
      }
    );

    expect(errorKind(error)).toBe('Error 23505');
  });

  it('names the type of something thrown that is not an error', () => {
    expect(errorKind('visitor@example.com')).toBe('string');
    expect(errorKind(undefined)).toBe('undefined');
  });
});
