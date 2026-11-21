import { nonceFrom } from './nonce';

describe('nonceFrom', () => {
  it('reads the nonce off the context', () => {
    expect(nonceFrom({ nonce: 'abc' })).toBe('abc');
  });

  it.each([undefined, null, 'text', {}, { nonce: 1 }])(
    'has none in %j',
    (context) => {
      expect(nonceFrom(context)).toBeUndefined();
    }
  );
});
