import { readFileSync } from 'fs';
import { join } from 'path';

import {
  STORYBOOK_THEMES,
  parseStoryIds,
  storyShots,
  storySnapshotName,
  storyUrl
} from './snapshot.logic';

describe('storyUrl', () => {
  it('asks for the story alone, with the toolbar globals', () => {
    expect(
      storyUrl('http://127.0.0.1:1234/', 'a-b--c', 'payload-admin', 'dark')
    ).toBe(
      'http://127.0.0.1:1234/iframe.html?id=a-b--c&viewMode=story&globals=theme:payload-admin;colorScheme:dark'
    );
  });
});

describe('storySnapshotName', () => {
  it('names the story and how it was drawn', () => {
    expect(
      storySnapshotName({
        storyId: 'a--b',
        theme: 'frost',
        colorScheme: 'light',
        viewport: 'phone'
      })
    ).toBe('a--b--frost-light-phone.png');
  });
});

describe('storyShots', () => {
  it('varies the story fastest and the theme slowest', () => {
    const shots = storyShots(
      ['s1', 's2'],
      ['frost', 'payload-admin'],
      ['light', 'dark'],
      ['phone']
    );
    expect(shots).toHaveLength(8);
    expect(shots.slice(0, 3).map((s) => [s.storyId, s.colorScheme])).toEqual([
      ['s1', 'light'],
      ['s2', 'light'],
      ['s1', 'dark']
    ]);
    expect(shots[4].theme).toBe('payload-admin');
  });
});

describe('parseStoryIds', () => {
  it('trims, drops empties and repeats', () => {
    expect(parseStoryIds(' a--b, ,c--d,a--b')).toEqual(['a--b', 'c--d']);
  });

  it('refuses nothing at all', () => {
    expect(() => parseStoryIds(' , ')).toThrow('at least one');
  });

  it('refuses ids that could leave the output folder', () => {
    expect(() => parseStoryIds('../x--y')).toThrow('Not a story id');
  });
});

describe('STORYBOOK_THEMES', () => {
  it('lists the themes the Storybook toolbar offers', () => {
    const meta = readFileSync(
      join(
        __dirname,
        '../../../../../apps/storybook/.storybook/themes-meta.ts'
      ),
      'utf8'
    );
    const list = /STORYBOOK_THEMES = \[([^\]]*)\]/.exec(meta)?.[1] ?? '';
    expect([...list.matchAll(/'([^']+)'/g)].map((m) => m[1])).toEqual([
      ...STORYBOOK_THEMES
    ]);
  });
});
