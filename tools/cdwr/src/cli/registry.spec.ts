import { type Entry, type Group, lookup, suggest } from './registry';

const load = () => Promise.reject(new Error('not loaded'));
const groups: Group[] = [
  { name: 'db', summary: '' },
  { name: 'fly', summary: '' }
];
const entries: Entry[] = [
  { path: ['db', 'backup'], summary: 'Back up', danger: 'read', load },
  { path: ['db', 'test-migration'], summary: '', danger: 'mutate', load },
  { path: ['doctor'], summary: '', danger: 'read', load }
];

describe('lookup', () => {
  it('finds a grouped command and hands over the rest of argv', () => {
    const found = lookup(['db', 'backup', '--env', 'x'], groups, entries);
    expect(found.kind).toBe('command');
    expect(found.rest).toEqual(['--env', 'x']);
  });

  it('finds a top-level command', () => {
    const found = lookup(['doctor', '--json'], groups, entries);
    expect(found).toMatchObject({ kind: 'command', rest: ['--json'] });
  });

  it('keeps flags that come before the command words', () => {
    const found = lookup(['--json', 'db', 'backup'], groups, entries);
    expect(found).toMatchObject({ kind: 'command', rest: ['--json'] });
  });

  it('returns the group when only its name is given', () => {
    expect(lookup(['db'], groups, entries)).toMatchObject({
      kind: 'group',
      rest: []
    });
  });

  it('returns none for an unknown word', () => {
    expect(lookup(['nope'], groups, entries)).toMatchObject({
      kind: 'none',
      rest: ['nope']
    });
  });
});

describe('suggest', () => {
  it('offers close names', () => {
    expect(suggest('bakup', entries, groups)).toEqual(['db backup']);
    expect(suggest('docter', entries, groups)).toEqual(['doctor']);
    expect(suggest('zzz', entries, groups)).toEqual([]);
  });
});
