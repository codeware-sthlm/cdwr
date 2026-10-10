import { layerVault } from './layer-vault';

const committed = {
  DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/cms',
  PAYLOAD_SECRET_KEY: 'secret',
  SEED_SOURCE: 'none'
};

describe('layerVault', () => {
  it.each([
    {
      name: 'unset -> vault',
      inherited: {},
      vault: { NEW_KEY: 'v' },
      source: 'vault'
    },
    {
      name: 'undefined -> vault',
      inherited: { NEW_KEY: undefined },
      vault: { NEW_KEY: 'v' },
      source: 'vault'
    },
    {
      name: 'equals committed -> vault',
      inherited: { DATABASE_URL: committed.DATABASE_URL },
      vault: { DATABASE_URL: 'postgresql://real@db:5432/cms' },
      source: 'vault'
    },
    {
      name: 'placeholder equal to committed -> vault',
      inherited: { PAYLOAD_SECRET_KEY: 'secret' },
      vault: { PAYLOAD_SECRET_KEY: 'real-secret' },
      source: 'vault'
    },
    {
      name: 'isolated e2e database -> environment',
      inherited: {
        DATABASE_URL: 'postgresql://postgres:postgres@localhost:5433/cms-e2e'
      },
      vault: {
        DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/cms'
      },
      source: 'environment'
    },
    {
      name: 'target env SEED_SOURCE -> environment',
      inherited: { SEED_SOURCE: 'local' },
      vault: { SEED_SOURCE: 'off' },
      source: 'environment'
    }
  ])('$name', ({ inherited, vault, source }) => {
    const [key] = Object.keys(vault);
    const result = layerVault({
      inherited,
      committed,
      explicit: new Set(),
      vault
    });
    expect(result.sources).toEqual({ [key as string]: source });
    expect(result.apply).toEqual(source === 'vault' ? vault : {});
  });

  it('known edge: an explicit value identical to the committed one loses', () => {
    const result = layerVault({
      inherited: { SEED_SOURCE: 'none' },
      committed,
      explicit: new Set(),
      vault: { SEED_SOURCE: 'local' }
    });
    expect(result.apply).toEqual({ SEED_SOURCE: 'local' });
    expect(result.sources).toEqual({ SEED_SOURCE: 'vault' });
  });

  it('a target env key always wins, even when equal to the committed value', () => {
    const result = layerVault({
      inherited: { SEED_SOURCE: 'none', PAYLOAD_SECRET_KEY: 'secret' },
      committed,
      explicit: new Set(['SEED_SOURCE']),
      vault: { SEED_SOURCE: 'local', PAYLOAD_SECRET_KEY: 'real' }
    });
    expect(result.sources).toEqual({
      SEED_SOURCE: 'environment',
      PAYLOAD_SECRET_KEY: 'vault'
    });
    expect(result.apply).toEqual({ PAYLOAD_SECRET_KEY: 'real' });
  });

  it('only considers vault keys', () => {
    const result = layerVault({
      inherited: { OTHER: 'x' },
      committed,
      explicit: new Set(),
      vault: {}
    });
    expect(result).toEqual({ apply: {}, sources: {} });
  });
});
