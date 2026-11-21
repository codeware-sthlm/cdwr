import { UsageError } from '../../cli/errors';

import { copyState } from './copy-secret.logic';
import { rewrite } from './rewrite-url.logic';
import {
  guard,
  refuseChanged,
  remember,
  scrub,
  scrubError
} from './secret-values.logic';
import { setState } from './set-config.logic';

describe('scrub', () => {
  it('replaces every value, the longest first', () => {
    expect(scrub('a abc b abc', ['abc', 'a'])).toBe('*** *** b ***');
    expect(scrub('nothing', [''])).toBe('nothing');
  });

  it('keeps a usage error a usage error', () => {
    expect(scrubError(new UsageError('has x'), ['x'])).toBeInstanceOf(
      UsageError
    );
    expect(scrubError(new Error('has x'), ['x']).message).toBe('has ***');
  });

  it('scrubs what a guarded function throws, with values learned late', async () => {
    const known: string[] = [];
    await expect(
      guard(known, async () => {
        known.push('s3cret');
        throw new Error('boom s3cret');
      })
    ).rejects.toThrow('boom ***');
  });
});

describe('copyState', () => {
  it('tells absent, same and different, and a missing source', () => {
    expect(copyState('/apps/cms', 'A', 'B', 'v', undefined)).toBe('absent');
    expect(copyState('/apps/cms', 'A', 'B', 'v', 'v')).toBe('same');
    expect(() => copyState('/apps/cms', 'A', 'B', 'v', 'w')).toThrow(
      'B at /apps/cms already holds another value; secret-copy never overwrites'
    );
    expect(() =>
      copyState('/apps/cms', 'A', 'B', undefined, undefined)
    ).toThrow('A not found at /apps/cms');
  });
});

describe('setState', () => {
  it('tells absent, same and different', () => {
    expect(setState(undefined, '4')).toBe('absent');
    expect(setState('4', '4')).toBe('same');
    expect(setState('3', '4')).toBe('different');
  });
});

describe('rewrite', () => {
  const url = 'postgresql://u:pw%2Fx@db.a.co:5432/app?ssl=1#f';

  it('keeps everything but host, port and user', () => {
    const result = rewrite(
      url,
      { host: 'db.b.co', port: '6543', user: 'v' },
      '/apps/cms',
      'K'
    );
    expect(result.next).toBe('postgresql://v:pw%2Fx@db.b.co:6543/app?ssl=1#f');
    expect(result.state).toBe('different');
  });

  it('is the same when the parts already hold', () => {
    expect(
      rewrite(url, { port: '5432', user: 'u' }, '/apps/cms', 'K').state
    ).toBe('same');
  });

  it('refuses a url without a password', () => {
    expect(() =>
      rewrite('postgresql://u@h/app', { port: '1' }, '/apps/cms', 'K')
    ).toThrow('K at /apps/cms is not a url with a password');
  });
});

describe('remember and refuseChanged', () => {
  it('holds a token, not the value, and accepts the same value', () => {
    const token = remember('s3cret');
    expect(token).not.toContain('s3cret');
    expect(() =>
      refuseChanged(token, 's3cret', 'K', '/apps/cms')
    ).not.toThrow();
    const none = remember(undefined);
    expect(() =>
      refuseChanged(none, undefined, 'K', '/apps/cms')
    ).not.toThrow();
  });

  it('refuses a changed value', () => {
    const token = remember('a');
    expect(() => refuseChanged(token, 'b', 'K', '/apps/cms')).toThrow(
      'K at /apps/cms changed since the plan; nothing written'
    );
  });

  it('refuses an unknown token', () => {
    expect(() => refuseChanged('not-a-token', 'a', 'K', '/apps/cms')).toThrow(
      'K at /apps/cms changed since the plan; nothing written'
    );
  });
});
