import { EXIT, messageOf } from './cli/errors';
import { renderGroupHelp, renderTopHelp } from './cli/help';
import { loadPrefs } from './cli/prefs';
import { type Entry, lookup, nameOf, suggest } from './cli/registry';
import { fail, runCommand } from './cli/run';
import { loadWorkspace } from './cli/workspace';
import { ENTRIES, GROUPS } from './commands';
import { launchApp } from './ui/app/run-app';
import { theme } from './ui/theme';
import type { Ui } from './ui/ui';

const out = (text: string) => process.stdout.write(`${text}\n`);

/** Flags that mean "no prompts" or "text only", so the app stays out of the way */
const PLAIN_FLAGS = ['--json', '--non-interactive', '--help', '-h'];

const unknown = (word: string, near: string[]): number => {
  const hint = near.length
    ? `. Did you mean ${near.map((n) => theme.code(n)).join(', ')}?`
    : '';
  process.stderr.write(`Unknown command '${word}'${hint}\n`);
  return EXIT.usage;
};

async function main(argv: string[]): Promise<number> {
  const workspace = loadWorkspace();
  const tty = Boolean(process.stdout.isTTY && process.stdin.isTTY);
  const useApp = tty && !argv.some((a) => PLAIN_FLAGS.includes(a));

  if (argv[0] === '--version' || argv[0] === '-V') {
    out(workspace.version);
    return EXIT.ok;
  }

  const found = lookup(argv, GROUPS, ENTRIES);
  const wantsHelp = argv.includes('--help') || argv.includes('-h');

  const runInApp = (initial?: { entry: Entry; argv: string[] }) =>
    launchApp({
      version: workspace.version,
      groups: GROUPS,
      entries: ENTRIES,
      initial,
      run: (entry, rest, ui) => runEntry(entry, rest, workspace.root, true, ui)
    });

  if (found.kind === 'none') {
    const word = found.rest.find((a) => !a.startsWith('-'));
    if (word) return unknown(word, suggest(word, ENTRIES, GROUPS));
    if (!useApp || wantsHelp) {
      out(renderTopHelp(GROUPS, ENTRIES, workspace.version));
      return wantsHelp ? EXIT.ok : EXIT.usage;
    }
    return runInApp();
  }

  if (found.kind === 'group') {
    const own = ENTRIES.filter((e) => e.path[0] === found.group.name);
    const word = found.rest.find((a) => !a.startsWith('-'));
    if (word) {
      return unknown(`${found.group.name} ${word}`, suggest(word, own, []));
    }
    out(renderGroupHelp(found.group, own));
    return wantsHelp ? EXIT.ok : EXIT.usage;
  }

  if (useApp) return runInApp({ entry: found.entry, argv: found.rest });
  return runEntry(found.entry, found.rest, workspace.root, tty);
}

async function runEntry(
  entry: Entry,
  argv: string[],
  root: string,
  interactive: boolean,
  ui?: Ui
): Promise<number> {
  const command = await entry.load();
  return runCommand({
    name: nameOf(entry),
    command,
    argv,
    root,
    env: process.env,
    prefs: loadPrefs(),
    interactive,
    ui,
    // Inside the app, text meant for stdout goes to the pane
    stdout: ui ? (text) => ui.write(text) : undefined
  });
}

main(process.argv.slice(2))
  .then((code) => {
    process.exit(code);
  })
  .catch((error: unknown) => {
    process.exitCode = fail(
      error,
      false,
      out,
      process.argv.includes('--verbose')
    );
    if (!(error instanceof Error))
      process.stderr.write(`${messageOf(error)}\n`);
  });
