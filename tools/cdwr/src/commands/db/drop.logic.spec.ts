import { dropStatement, parseDatabaseList } from './drop.logic';

describe('parseDatabaseList', () => {
  it('parses CSV rows into databases', () => {
    const output = [
      'pr-123,postgres,UTF8,42 MB',
      'pr-456,postgres,UTF8,7 MB'
    ].join('\n');
    expect(parseDatabaseList(output)).toEqual([
      { name: 'pr-123', owner: 'postgres', encoding: 'UTF8', size: '42 MB' },
      { name: 'pr-456', owner: 'postgres', encoding: 'UTF8', size: '7 MB' }
    ]);
  });

  it('drops the built-in system databases', () => {
    const output = [
      'postgres,postgres,UTF8,7 MB',
      'template0,postgres,UTF8,7 MB',
      'template1,postgres,UTF8,7 MB',
      'pr-123,postgres,UTF8,42 MB'
    ].join('\n');
    expect(parseDatabaseList(output).map((db) => db.name)).toEqual(['pr-123']);
  });

  it('is empty for blank output', () => {
    expect(parseDatabaseList('')).toEqual([]);
    expect(parseDatabaseList('\n\n')).toEqual([]);
  });
});

describe('dropStatement', () => {
  it('quotes the name and forces the drop', () => {
    expect(dropStatement('pr-123')).toBe(
      'DROP DATABASE IF EXISTS "pr-123" WITH (FORCE);'
    );
  });
});
