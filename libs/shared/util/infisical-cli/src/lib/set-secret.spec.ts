import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname } from 'node:path';

import { InfisicalMissingError } from './infisical-runner';
import { deleteSecret, probeWrite, setSecretFromFile } from './set-secret';

const VALUE = 'SENTINEL-SECRET-VALUE';
const target = {
  path: '/apps/cms',
  environment: 'prod',
  key: 'API_KEY',
  projectId: 'proj-1'
};

const fileOf = (args: string[]) =>
  (args.find((arg) => arg.includes('=@')) ?? '').split('=@')[1];

describe('setSecretFromFile', () => {
  it('passes the value by file, never in argv', () => {
    let seen: { args: string[]; content: string; mode: number } | undefined;
    const run = (args: string[]) => {
      const file = fileOf(args);
      seen = {
        args,
        content: readFileSync(file, 'utf8'),
        mode: statSync(file).mode & 0o777
      };
      return '';
    };
    setSecretFromFile({ ...target, value: VALUE }, run);

    expect(seen?.args).toEqual([
      'secrets',
      'set',
      expect.stringMatching(/^API_KEY=@.+/),
      '--env=prod',
      '--path=/apps/cms',
      '--type=shared',
      '--silent',
      '--projectId=proj-1'
    ]);
    expect(seen?.args.join(' ')).not.toContain(VALUE);
    expect(seen?.content).toBe(VALUE);
    expect(seen?.mode).toBe(0o600);
  });

  it('omits projectId when not given', () => {
    let args: string[] = [];
    setSecretFromFile(
      { path: '/a', environment: 'dev', key: 'K', value: 'v' },
      (a) => {
        args = a;
        return '';
      }
    );
    expect(args.some((arg) => arg.startsWith('--projectId'))).toBe(false);
  });

  it('removes the directory afterwards', () => {
    let dir = '';
    setSecretFromFile({ ...target, value: VALUE }, (args) => {
      dir = dirname(fileOf(args));
      return '';
    });
    expect(existsSync(dir)).toBe(false);
  });

  it('removes the directory and hides the output when the runner throws', () => {
    let dir = '';
    let error: unknown;
    try {
      setSecretFromFile({ ...target, value: VALUE }, (args) => {
        dir = dirname(fileOf(args));
        throw new Error(`stdout ${VALUE}`);
      });
    } catch (e) {
      error = e;
    }
    expect(existsSync(dir)).toBe(false);
    if (!(error instanceof Error)) throw new Error('expected an error');
    const failure = error;
    expect(failure.message).toBe(
      'infisical secrets set failed for API_KEY at /apps/cms (prod)'
    );
    expect(failure.message).not.toContain(VALUE);
    expect(failure.cause).toBeUndefined();
  });
});

describe('deleteSecret', () => {
  it('deletes the shared key', () => {
    let args: string[] = [];
    deleteSecret(target, (a) => {
      args = a;
      return '';
    });
    expect(args).toEqual([
      'secrets',
      'delete',
      'API_KEY',
      '--env=prod',
      '--path=/apps/cms',
      '--type=shared',
      '--silent',
      '--projectId=proj-1'
    ]);
  });

  it('names only key, path and environment on failure', () => {
    expect(() =>
      deleteSecret(target, () => {
        throw new Error(VALUE);
      })
    ).toThrow(
      new Error(
        'infisical secrets delete failed for API_KEY at /apps/cms (prod)'
      )
    );
  });
});

describe('probeWrite', () => {
  const probe = { path: '/apps/cms', environment: 'prod', projectId: 'p' };
  const PROBE_KEY = /^ROTATION_WRITE_CHECK_[0-9A-F]{16}$/;
  const setKey = (args: string[]) => args[2].split('=@')[0];

  it('sets, reads back and deletes the same unique key', () => {
    const order: string[] = [];
    const keys: string[] = [];
    let value = '';
    probeWrite(probe, (args) => {
      order.push(args[0] === 'secrets' ? args[1] : args[0]);
      if (args[1] === 'set') {
        keys.push(setKey(args));
        value = readFileSync(fileOf(args), 'utf8');
      }
      if (args[0] === 'export') {
        return JSON.stringify([{ key: keys[0], value, type: 'shared' }]);
      }
      if (args[1] === 'delete') keys.push(args[2]);
      return '';
    });
    expect(order).toEqual(['set', 'export', 'delete']);
    expect(keys[0]).toMatch(PROBE_KEY);
    expect(keys[1]).toBe(keys[0]);
  });

  it('uses a different key on each call', () => {
    const keys: string[] = [];
    const run = (args: string[]) => {
      if (args[1] === 'delete') keys.push(args[2]);
      return args[0] === 'export' ? '[]' : '';
    };
    for (let i = 0; i < 2; i++) {
      expect(() => probeWrite(probe, run)).toThrow();
    }
    expect(keys[0]).not.toBe(keys[1]);
  });

  it('still deletes and reports when the read-back differs', () => {
    const order: string[] = [];
    expect(() =>
      probeWrite(probe, (args) => {
        order.push(args[0] === 'secrets' ? args[1] : args[0]);
        return args[0] === 'export' ? '[]' : '';
      })
    ).toThrow('Infisical will not accept writes at /apps/cms (prod)');
    expect(order).toEqual(['set', 'export', 'delete']);
  });

  it('fails naming the key when the cleanup fails after a good write', () => {
    let value = '';
    let key = '';
    expect(() =>
      probeWrite(probe, (args) => {
        if (args[1] === 'set') {
          key = setKey(args);
          value = readFileSync(fileOf(args), 'utf8');
        }
        if (args[0] === 'export') {
          return JSON.stringify([{ key, value, type: 'shared' }]);
        }
        if (args[1] === 'delete') throw new Error('cleanup');
        return '';
      })
    ).toThrow(
      /Infisical took the write at \/apps\/cms \(prod\), but the check key ROTATION_WRITE_CHECK_[0-9A-F]{16} could not be removed; delete it by hand/
    );
  });

  it('keeps the original error when the cleanup fails too', () => {
    expect(() =>
      probeWrite(probe, (args) => {
        if (args[1] === 'set') throw new Error('nope');
        throw new Error('cleanup');
      })
    ).toThrow('Infisical will not accept writes at /apps/cms (prod)');
  });
});

describe('a missing Infisical CLI', () => {
  const missing = () => {
    throw new InfisicalMissingError();
  };

  it('is rethrown unchanged', () => {
    expect(() =>
      setSecretFromFile({ ...target, value: VALUE }, missing)
    ).toThrow(InfisicalMissingError);
    expect(() => deleteSecret(target, missing)).toThrow(InfisicalMissingError);
    expect(() =>
      probeWrite({ path: '/a', environment: 'dev' }, missing)
    ).toThrow(InfisicalMissingError);
  });
});
