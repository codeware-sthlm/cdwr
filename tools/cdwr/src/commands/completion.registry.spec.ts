import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { SHELLS, collect, render } from '../cli/completion';

import { treeOf } from './completion.install';
import { ENTRIES, GROUPS } from './index';

// A command in the registry must reach every shell's script; the refresh only
// rewrites the file, so a renderer that drops one would go unnoticed
describe('completion of the real registry', () => {
  it.each(SHELLS)('%s offers every command and its flags', async (shell) => {
    const commands = await collect(ENTRIES);
    const script = render(shell, GROUPS, commands);
    for (const command of commands) {
      for (const word of command.path.slice(0, 2)) {
        expect(script).toContain(word);
      }
      for (const flag of command.flags) {
        expect(script).toContain(
          shell === 'fish' ? `-l ${flag.name}` : `--${flag.name}`
        );
      }
    }
  });

  it('zsh and bash route each command by its full path', async () => {
    const commands = await collect(ENTRIES);
    const zsh = render('zsh', GROUPS, commands);
    const bash = render('bash', GROUPS, commands);
    for (const command of commands.filter((c) => c.path.length > 1)) {
      expect(zsh).toContain(`'${command.path.join(' ')}')`);
      expect(bash).toContain(`'${command.path.join(' ')}')`);
    }
  });
});

// The fingerprint the shim compares: it must move with the cli's source and
// only with it, or a new command would never trigger a refresh
describe('treeOf', () => {
  let repo: string;
  const git = (...args: string[]) =>
    spawnSync(
      'git',
      ['-c', 'user.name=t', '-c', 'user.email=t@t', '-C', repo, ...args],
      { encoding: 'utf8' }
    );
  const commit = (path: string, text: string) => {
    mkdirSync(join(repo, path, '..'), { recursive: true });
    writeFileSync(join(repo, path), text);
    git('add', '-A');
    git('commit', '-qm', path);
  };

  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), 'cdwr-tree-'));
    git('init', '-q');
    commit('tools/cdwr/src/commands/index.ts', 'export const ENTRIES = [];\n');
  });

  afterEach(() => rmSync(repo, { recursive: true, force: true }));

  it('changes when a command is added', () => {
    const before = treeOf(repo);
    commit('tools/cdwr/src/commands/new.ts', 'export default {};\n');
    expect(before).toMatch(/^[0-9a-f]{40,}$/);
    expect(treeOf(repo)).not.toBe(before);
  });

  it('stays put for a commit elsewhere', () => {
    const before = treeOf(repo);
    commit('apps/cms/readme.md', 'x\n');
    expect(treeOf(repo)).toBe(before);
  });

  it('is undefined outside git', () => {
    expect(treeOf(tmpdir())).toBeUndefined();
  });
});
