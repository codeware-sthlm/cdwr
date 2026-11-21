import type { ApiKey } from '../../services/supabase-management';
import { CATALOG } from '../secrets/catalog';

import {
  SUPABASE_KEY,
  describeKey,
  descriptionOf,
  keyNameOf,
  toDelete
} from './rotate-supabase.logic';

const key = (id: string, extra: Partial<ApiKey> = {}): ApiKey => ({
  id,
  name: id,
  type: 'secret',
  prefix: 'sb_secret_abcd',
  description: null,
  hash: `hash-${id}`,
  inserted_at: '2026-11-21T10:00:00Z',
  ...extra
});

const opts = (extra: Partial<Parameters<typeof toDelete>[1]> = {}) => ({
  keep: 'new',
  host: 'agent-host',
  spare: [],
  ...extra
});

describe('toDelete', () => {
  it('deletes the key the vault held, found by hash', () => {
    const { remove, others } = toDelete(
      [key('old'), key('other')],
      opts({ oldHash: 'hash-old' })
    );
    expect(remove.map((k) => k.id)).toEqual(['old']);
    expect(others.map((k) => k.id)).toEqual(['other']);
  });

  it("deletes an earlier run's leftover by its description", () => {
    const { remove } = toDelete(
      [key('left', { description: descriptionOf('agent-host') })],
      opts()
    );
    expect(remove.map((k) => k.id)).toEqual(['left']);
  });

  it("leaves another host's leftover alone", () => {
    const { remove } = toDelete(
      [key('left', { description: descriptionOf('other-host') })],
      opts()
    );
    expect(remove).toEqual([]);
  });

  it('never deletes the key to keep', () => {
    const { remove, others } = toDelete(
      [key('new', { description: descriptionOf('agent-host') })],
      opts({ oldHash: 'hash-new' })
    );
    expect(remove).toEqual([]);
    expect(others).toEqual([]);
  });

  it('never deletes a default key, even when the vault holds it', () => {
    const { remove, others } = toDelete(
      [key('d', { name: 'default' })],
      opts({ oldHash: 'hash-d' })
    );
    expect(remove).toEqual([]);
    expect(others.map((k) => k.id)).toEqual(['d']);
  });

  it("never deletes the key this checkout's env holds", () => {
    const { remove } = toDelete(
      [key('mac', { description: descriptionOf('agent-host') })],
      opts({ oldHash: 'hash-mac', spare: ['hash-mac'] })
    );
    expect(remove).toEqual([]);
  });

  it('only considers secret keys with an id', () => {
    const { remove, others } = toDelete(
      [
        key('legacy', { type: 'legacy' }),
        key('pub', { type: 'publishable' }),
        key('', { hash: 'hash-old' })
      ],
      opts({ oldHash: 'hash-old' })
    );
    expect(remove).toEqual([]);
    expect(others).toEqual([]);
  });
});

describe('keyNameOf', () => {
  const now = new Date('2026-11-21T22:40:31Z');

  it('names the host and the minute', () => {
    expect(keyNameOf('agent-host', now)).toBe('agent_host_20261121_2240');
  });

  it('drops a user and starts with a letter', () => {
    expect(keyNameOf('hakan@agent-host', now)).toBe('agent_host_20261121_2240');
    expect(keyNameOf('192.168.1.5', now)).toBe(
      'host_192_168_1_5_20261121_2240'
    );
  });
});

describe('descriptionOf', () => {
  it('is the same however the host is reached', () => {
    expect(descriptionOf('hakan@Agent-Host')).toBe(descriptionOf('agent-host'));
  });
});

describe('describeKey', () => {
  it('names the key without its value', () => {
    expect(
      describeKey(key('k', { name: 'agent_host_x', description: 'd' }))
    ).toBe('agent_host_x (sb_secret_abcd…) "d", created 2026-11-21');
  });
});

describe('the catalog', () => {
  it('rotates the service key with this command', () => {
    const entry = CATALOG.find((e) => e.key === SUPABASE_KEY);
    expect(entry && 'rotation' in entry ? entry.rotation : undefined).toEqual({
      command: ['agent', 'rotate', 'supabase']
    });
  });
});
