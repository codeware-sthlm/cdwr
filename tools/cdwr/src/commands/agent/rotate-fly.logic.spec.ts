import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { FlyToken } from '../../services/fly';
import { CATALOG } from '../secrets/catalog';

import {
  FLY_ROTATIONS,
  type FlyKey,
  NOT_READY,
  catalogEntryOf,
  createArgs,
  namesOf,
  newTokenId,
  revokeSet,
  sha256Hex,
  vaultLineHashCommand
} from './rotate-fly.logic';

const token = (id: string, name: string, extra = {}): FlyToken => ({
  id,
  name,
  expiresAt: '2027-03-04T10:00:00Z',
  ...extra
});

describe('FLY_ROTATIONS', () => {
  it('covers exactly the catalog entries rotated by this command', () => {
    const keys = CATALOG.filter(
      (entry) =>
        entry.kind !== 'setting' &&
        'command' in entry.rotation &&
        entry.rotation.command.join(' ') === 'agent rotate fly'
    ).map((entry) => entry.key);
    expect(keys.sort()).toEqual(Object.keys(FLY_ROTATIONS).sort());
  });
});

describe('namesOf', () => {
  it('reads the names from the catalog', () => {
    expect(namesOf('FLY_API_TOKEN')).toEqual({
      name: 'agent-host platform read (FLY_API_TOKEN)',
      legacyName: 'Readonly org token'
    });
    expect(namesOf('DESK_FLY_TOKEN')).toEqual({
      name: 'agent-host desk deploy (DESK_FLY_TOKEN)',
      legacyName: 'Desk org token'
    });
  });

  it('finds the agent-host entry', () => {
    expect(catalogEntryOf('FLY_API_TOKEN')).toMatchObject({
      project: 'agent-host',
      path: '/agent-queue'
    });
  });

  it('throws for a key without an entry', () => {
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    expect(() => catalogEntryOf('NOPE' as FlyKey)).toThrow();
  });
});

describe('createArgs', () => {
  it('creates a one year token of the key scope', () => {
    expect(createArgs('FLY_API_TOKEN')).toEqual([
      'tokens',
      'create',
      'readonly',
      '-o',
      'codeware',
      '-n',
      'agent-host platform read (FLY_API_TOKEN)',
      '-x',
      '8760h'
    ]);
    expect(createArgs('DESK_FLY_TOKEN', 'other').slice(0, 5)).toEqual([
      'tokens',
      'create',
      'org',
      '-o',
      'other'
    ]);
  });
});

describe('newTokenId', () => {
  const name = 'agent-host platform read (FLY_API_TOKEN)';

  it('finds the one new live token', () => {
    const before = [token('1', name)];
    const after = [before[0]!, token('2', name), token('3', 'other')];
    expect(newTokenId(before, after, name)).toEqual({ kind: 'one', id: '2' });
  });

  it('finds none', () => {
    const before = [token('1', name)];
    expect(newTokenId(before, before, name)).toEqual({ kind: 'none' });
  });

  it('ignores a revoked token', () => {
    const revoked = token('2', name, { revokedAt: '2027-01-01T00:00:00Z' });
    expect(newTokenId([], [revoked], name)).toEqual({ kind: 'none' });
  });

  it('reports several', () => {
    expect(newTokenId([], [token('1', name), token('2', name)], name)).toEqual({
      kind: 'many',
      ids: ['1', '2']
    });
  });
});

describe('revokeSet', () => {
  const names = { name: 'new', legacyName: 'old' };
  const ids = (result: ReturnType<typeof revokeSet>) =>
    result.tokens.map((t) => t.id);

  it('takes live tokens under either name except the one to keep', () => {
    const tokens = [
      token('1', 'old'),
      token('2', 'new'),
      token('3', 'new'),
      token('4', 'old', { revokedAt: '2027-01-01T00:00:00Z' }),
      token('5', 'unrelated')
    ];
    const result = revokeSet(tokens, names, '3');
    expect(result.kind).toBe('ok');
    expect(ids(result)).toEqual(['2', '1']);
  });

  it('ignores the legacy name when there is none', () => {
    const tokens = [token('1', 'old'), token('2', 'new')];
    expect(ids(revokeSet(tokens, { name: 'new' }, 'x'))).toEqual(['2']);
  });

  it('refuses several live tokens under the legacy name', () => {
    const tokens = [token('1', 'old'), token('2', 'old'), token('3', 'new')];
    const result = revokeSet(tokens, names, 'x');
    expect(result.kind).toBe('ambiguous');
    expect(ids(result)).toEqual(['1', '2']);
  });

  it('takes one legacy token, and a revoked twin does not count', () => {
    const tokens = [
      token('1', 'old'),
      token('2', 'old', { revokedAt: '2027-01-01T00:00:00Z' })
    ];
    const result = revokeSet(tokens, names, 'x');
    expect(result.kind).toBe('ok');
    expect(ids(result)).toEqual(['1']);
  });
});

describe('sha256Hex', () => {
  it('hashes the value', () => {
    expect(sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    );
  });
});

describe('vaultLineHashCommand', () => {
  const hasSha256sum =
    spawnSync('sha256sum', ['--version']).error === undefined;

  it('runs sh with a script for the key and file', () => {
    const [shell, flag, script] = vaultLineHashCommand('DESK_FLY_TOKEN');
    expect([shell, flag]).toEqual(['sh', '-c']);
    expect(script).toContain('s/^DESK_FLY_TOKEN=//p');
    expect(script).toContain('/run/agent/vault.env');
  });

  const vault = (content?: string) => {
    const file = join(mkdtempSync(join(tmpdir(), 'vault-')), 'vault.env');
    if (content !== undefined) writeFileSync(file, content);
    return file;
  };
  const exec = (key: FlyKey, file: string) => {
    const [cmd, ...args] = vaultLineHashCommand(key, file);
    return spawnSync(cmd!, args, { encoding: 'utf8' });
  };

  it.skipIf(!hasSha256sum)('prints the hash of the key value only', () => {
    const value = 'FlyV1 fm2_abc=,def';
    const file = vault(`OTHER=x\nFLY_API_TOKEN=${value}\nDESK_FLY_TOKEN=y\n`);
    expect(exec('FLY_API_TOKEN', file).stdout.trim()).toBe(sha256Hex(value));
  });

  it('exits NOT_READY when the file is missing', () => {
    expect(exec('FLY_API_TOKEN', vault()).status).toBe(NOT_READY);
  });

  it('exits NOT_READY when the file is empty', () => {
    expect(exec('FLY_API_TOKEN', vault('')).status).toBe(NOT_READY);
  });

  it('exits NOT_READY when the key has no line', () => {
    const result = exec('FLY_API_TOKEN', vault('DESK_FLY_TOKEN=y\n'));
    expect(result.status).toBe(NOT_READY);
    expect(result.stdout).toBe('');
  });
});
