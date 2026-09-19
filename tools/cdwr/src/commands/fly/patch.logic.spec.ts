import { plain } from '../../ui/theme';

import {
  deepMerge,
  diffTOML,
  mergeTOML,
  normalizeTOML,
  renderPatchDiff,
  summarizeChanges
} from './patch.logic';

describe('deepMerge', () => {
  it('merges tables key by key, patch wins on conflicts', () => {
    const merged = deepMerge(
      { http_service: { min_machines_running: 0, auto_stop_machines: 'off' } },
      { http_service: { min_machines_running: 1 } }
    );
    expect(merged).toEqual({
      http_service: { min_machines_running: 1, auto_stop_machines: 'off' }
    });
  });

  it('replaces arrays wholesale instead of merging elements', () => {
    const merged = deepMerge(
      { vm: [{ size: 'shared-cpu-1x', memory: '256mb' }] },
      { vm: [{ size: 'shared-cpu-2x' }] }
    );
    expect(merged).toEqual({ vm: [{ size: 'shared-cpu-2x' }] });
  });

  it('adds a base table for a key the base never had', () => {
    const merged = deepMerge({}, { deploy: { release_command: 'migrate' } });
    expect(merged).toEqual({ deploy: { release_command: 'migrate' } });
  });

  it('keeps unrelated base keys untouched', () => {
    const merged = deepMerge(
      { app: 'cdwr-cms' },
      { deploy: { strategy: 'rolling' } }
    );
    expect(merged).toEqual({
      app: 'cdwr-cms',
      deploy: { strategy: 'rolling' }
    });
  });
});

describe('mergeTOML', () => {
  it('parses, merges and stringifies back to TOML', () => {
    const base =
      "app = 'cdwr-cms'\n\n[http_service]\nmin_machines_running = 0\n";
    const patch = '[http_service]\nmin_machines_running = 1\n';
    const merged = mergeTOML(base, patch);
    expect(merged).toContain('app = "cdwr-cms"');
    expect(merged).toContain('min_machines_running = 1');
  });

  it('replaces an array-of-tables wholesale', () => {
    const base = "[[vm]]\nsize = 'shared-cpu-1x'\nmemory = '256mb'\n";
    const patch = "[[vm]]\nsize = 'shared-cpu-2x'\n";
    const merged = mergeTOML(base, patch);
    expect(merged).toContain('size = "shared-cpu-2x"');
    expect(merged).not.toContain('256mb');
  });
});

describe('normalizeTOML', () => {
  it('produces the same text for equivalent formatting', () => {
    const spaced = "app   =   'cdwr-cms'\n";
    const tight = "app='cdwr-cms'\n";
    expect(normalizeTOML(spaced)).toBe(normalizeTOML(tight));
  });

  it('returns the input unchanged when it does not parse', () => {
    expect(normalizeTOML('not { valid toml')).toBe('not { valid toml');
  });
});

describe('diffTOML', () => {
  it('finds no hunks for identical configs', () => {
    const config = "app = 'cdwr-cms'\n";
    expect(diffTOML(config, config)).toEqual([]);
  });

  it('groups a single change into one hunk with context', () => {
    const before = 'a = 1\nb = 2\nc = 3\nd = 4\ne = 5\n';
    const after = 'a = 1\nb = 2\nc = 30\nd = 4\ne = 5\n';
    const hunks = diffTOML(before, after, 2);
    expect(hunks).toHaveLength(1);
    const types = hunks[0]?.map((l) => l.type);
    expect(types).toEqual(['same', 'same', 'removed', 'added', 'same', 'same']);
  });

  it('splits two far-apart changes into separate hunks', () => {
    const before = [
      'a = 1',
      'b = 2',
      'c = 3',
      'd = 4',
      'e = 5',
      'f = 6',
      'g = 7',
      'h = 8',
      'i = 9'
    ].join('\n');
    const after = before
      .replace('a = 1', 'a = 100')
      .replace('i = 9', 'i = 900');
    const hunks = diffTOML(before, after, 1);
    expect(hunks).toHaveLength(2);
  });
});

describe('summarizeChanges', () => {
  it('marks an added top-level key', () => {
    expect(summarizeChanges('', "deploy = 'x'\n")).toEqual(['+[deploy]']);
  });

  it('marks a removed top-level key', () => {
    expect(summarizeChanges("deploy = 'x'\n", '')).toEqual(['-[deploy]']);
  });

  it('marks a changed top-level key', () => {
    expect(summarizeChanges('app = 1\n', 'app = 2\n')).toEqual(['~[app]']);
  });

  it('ignores keys that are identical on both sides', () => {
    expect(summarizeChanges("app = 'x'\n", "app = 'x'\n")).toEqual([]);
  });
});

describe('renderPatchDiff', () => {
  it('includes the app name, the summary tokens and the diff body', () => {
    const hunks = diffTOML('a = 1\n', 'a = 2\n', 1);
    const text = plain(renderPatchDiff('cdwr-cms', ['~[a]'], hunks));
    expect(text).toContain('cdwr-cms');
    expect(text).toContain('~[a]');
    expect(text).toContain('- a = 1');
    expect(text).toContain('+ a = 2');
  });
});
