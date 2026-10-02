import { describe, expect, it } from 'vitest';

import {
  type ImportGroup,
  filterGroups,
  importGroups,
  importHint,
  importLabel
} from './catalog';

const catalog = {
  reactHooks: ['useState', 'useEffect'],
  packages: ['clsx', 'zod']
};

const ready = { status: 'ready', names: ['Button', 'Card', 'Badge'] } as const;

const labels = (groups: ImportGroup[], id: ImportGroup['id']) =>
  groups.find((group) => group.id === id)?.entries.map(importLabel);

describe('importGroups', () => {
  it('lists the three groups in order', () => {
    expect(importGroups(catalog, ready).map((group) => group.id)).toEqual([
      'react',
      '@site/ui',
      'packages'
    ]);
  });

  it('leaves the kit group empty until the names are here', () => {
    for (const status of ['idle', 'loading', 'failed'] as const) {
      expect(labels(importGroups(catalog, { status }), '@site/ui')).toEqual([]);
    }
    expect(labels(importGroups(catalog, ready), '@site/ui')).toEqual([
      'Button',
      'Card',
      'Badge'
    ]);
  });

  it('asks for an empty named import of a package', () => {
    const packages = importGroups(catalog, ready)[2];
    expect(packages?.entries[0]).toEqual({ module: 'clsx', name: null });
  });
});

describe('filterGroups', () => {
  const groups = importGroups(catalog, ready);

  it('keeps everything for a blank query', () => {
    expect(filterGroups(groups, '  ')).toEqual(groups);
  });

  it('matches case-insensitively and ranks prefixes first', () => {
    const found = filterGroups(groups, 'EF');
    expect(labels(found, 'react')).toEqual(['useEffect']);

    const byB = filterGroups(groups, 'b');
    expect(labels(byB, '@site/ui')).toEqual(['Button', 'Badge']);
    expect(labels(filterGroups(groups, 'ge'), '@site/ui')).toEqual(['Badge']);
  });

  it('puts a prefix before a later match', () => {
    const found = filterGroups(
      importGroups(
        { reactHooks: ['useRef', 'refine', 'Ref'], packages: [] },
        ready
      ),
      'ref'
    );
    expect(labels(found, 'react')).toEqual(['refine', 'Ref', 'useRef']);
  });

  it('keeps empty groups so the picker can still describe them', () => {
    expect(filterGroups(groups, 'zzz').map((group) => group.entries)).toEqual([
      [],
      [],
      []
    ]);
  });
});

describe('importHint', () => {
  it('says what a row inserts', () => {
    expect(importHint({ module: 'react', name: 'useState' })).toBe(
      "from 'react'"
    );
    expect(importHint({ module: 'clsx', name: null })).toBe(
      "import {} from 'clsx'"
    );
  });
});
