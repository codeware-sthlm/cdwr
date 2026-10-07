import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { parseDotenv } from './parse-dotenv';

describe('parseDotenv', () => {
  it.each([
    ['KEY=value', { KEY: 'value' }],
    ['export KEY=value', { KEY: 'value' }],
    ['  KEY = value  ', { KEY: 'value' }],
    ['KEY=', { KEY: '' }],
    ['KEY=a=b', { KEY: 'a=b' }],
    ['KEY=value # comment', { KEY: 'value' }],
    ['KEY=a#b', { KEY: 'a#b' }],
    ['KEY=http://x/y#frag', { KEY: 'http://x/y#frag' }],
    ['KEY="a # b"', { KEY: 'a # b' }],
    ['KEY="a\\nb"', { KEY: 'a\nb' }],
    ['KEY="say \\"hi\\""', { KEY: 'say "hi"' }],
    ['KEY="back\\\\slash"', { KEY: 'back\\slash' }],
    ['KEY="v" # trailing', { KEY: 'v' }],
    ["KEY='a # b\\n'", { KEY: 'a # b\\n' }],
    ['# KEY=commented', {}],
    ['', {}],
    ['not a line', {}],
    ['A=1\r\nB=2', { A: '1', B: '2' }]
  ])('%j', (text, expected) => {
    expect(parseDotenv(text)).toEqual(expected);
  });

  it('later keys win', () => {
    expect(parseDotenv('A=1\nA=2')).toEqual({ A: '2' });
  });

  it.each(['apps/cms/.env', 'apps/web/.env'])(
    'parses the committed %s',
    (file) => {
      const text = readFileSync(
        join(__dirname, '../../../../../..', file),
        'utf8'
      );
      const parsed = parseDotenv(text);
      const keys = text
        .split('\n')
        .map((line) => /^([A-Z_][A-Z0-9_]*)=/.exec(line)?.[1])
        .filter((key): key is string => key !== undefined);
      expect(Object.keys(parsed).sort()).toEqual([...new Set(keys)].sort());
      for (const value of Object.values(parsed)) {
        expect(value).not.toMatch(/\s#/);
      }
    }
  );

  it('reads the cms values as written', () => {
    const parsed = parseDotenv(
      readFileSync(join(__dirname, '../../../../../../apps/cms/.env'), 'utf8')
    );
    expect(parsed['DATABASE_URL']).toBe(
      'postgresql://postgres:postgres@localhost:5432/cms'
    );
    expect(parsed['PAYLOAD_SECRET_KEY']).toBe('secret');
    expect(parsed['CUSTOM_URL']).toBe('');
  });
});
