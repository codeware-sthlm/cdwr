import { defineCommand } from './command';
import { type Completable, bash, collect, fish, zsh } from './completion';
import { input } from './inputs';
import type { Entry, Group } from './registry';

const groups: Group[] = [{ name: 'db', summary: "CMS database: it's here" }];
const commands: Completable[] = [
  {
    path: ['db', 'backup'],
    summary: 'Back up',
    flags: [
      {
        name: 'env',
        description: 'Which environment?',
        values: ['preview', 'production']
      },
      { name: 'yes', description: 'Skip confirmations' }
    ]
  },
  {
    path: ['doctor'],
    summary: 'Check: things',
    flags: [{ name: 'json', description: 'Machine output' }]
  }
];

describe('completion scripts', () => {
  it('zsh lists groups, subcommands and flags with values', () => {
    const script = zsh(groups, commands);
    expect(script).toContain("'db:CMS database\\: it'\\''s here'");
    expect(script).toContain("'backup:Back up'");
    expect(script).toContain(
      "'db backup') _arguments '--env[Which environment?]:value:(preview production)' '--yes[Skip confirmations]'"
    );
    expect(script).toContain("doctor) _arguments '--json[Machine output]'");
    expect(script.endsWith('compdef _cdwr cdwr\n')).toBe(true);
  });

  it('bash completes words per position', () => {
    const script = bash(groups, commands);
    expect(script).toContain('words="db doctor"');
    expect(script).toContain('db) words="backup"');
    expect(script).toContain(`'db backup') words="--env --yes"`);
    expect(script).toContain('complete -F _cdwr cdwr');
  });

  it('fish declares each subcommand and flag', () => {
    const script = fish(groups, commands);
    expect(script).toContain(
      "complete -c cdwr -n '__fish_use_subcommand' -a db -d 'CMS database: it'\\''s here'"
    );
    expect(script).toContain(
      "-n '__fish_seen_subcommand_from db; and not __fish_seen_subcommand_from backup' -a backup"
    );
    expect(script).toContain(
      "-n '__fish_seen_subcommand_from backup' -l env -d 'Which environment?' -x -a 'preview production'"
    );
  });
});

describe('collect', () => {
  it('flattens inputs and global flags from loaded commands', async () => {
    const entries: Entry[] = [
      {
        path: ['x'],
        summary: 'X',
        danger: 'read',
        load: async () =>
          defineCommand({
            summary: 'X',
            danger: 'read',
            inputs: {
              environment: input.enum(['a', 'b'], {
                prompt: 'Env?',
                flag: 'env'
              }),
              dryThing: input.boolean({ prompt: 'Dry?' })
            },
            plan: async () => ({ steps: [], data: null }),
            apply: async () => ({ summary: '' })
          })
      }
    ];
    const [x] = await collect(entries);
    expect(x?.flags.map((f) => f.name)).toEqual([
      'env',
      'dry-thing',
      'yes',
      'dry-run',
      'json',
      'non-interactive',
      'verbose',
      'help'
    ]);
    expect(x?.flags[0]?.values).toEqual(['a', 'b']);
  });
});
