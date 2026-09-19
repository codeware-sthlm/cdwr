import { EXIT, messageOf } from './cli/errors';
import { renderGroupHelp, renderTopHelp } from './cli/help';
import { loadPrefs } from './cli/prefs';
import { lookup, nameOf, suggest } from './cli/registry';
import { fail, runCommand } from './cli/run';
import { loadWorkspace } from './cli/workspace';
import { ENTRIES, GROUPS } from './commands';
import { banner } from './ui/banner';
import { MENU_LEGEND, pickFromMenu } from './ui/menu';
import { createTerminalUi } from './ui/terminal';
import { theme } from './ui/theme';

const out = (text: string) => process.stdout.write(`${text}\n`);

async function main(argv: string[]): Promise<number> {
  const workspace = loadWorkspace();
  const interactive = Boolean(process.stdout.isTTY && process.stdin.isTTY);

  if (argv[0] === '--version' || argv[0] === '-V') {
    out(workspace.version);
    return EXIT.ok;
  }

  const found = lookup(argv, GROUPS, ENTRIES);
  const wantsHelp = argv.includes('--help') || argv.includes('-h');

  if (found.kind === 'none') {
    const word = found.rest.find((a) => !a.startsWith('-'));
    if (word) {
      const near = suggest(word, ENTRIES, GROUPS);
      process.stderr.write(
        `Unknown command '${word}'${near.length ? `. Did you mean ${near.map((n) => theme.code(n)).join(', ')}?` : ''}\n`
      );
      return EXIT.usage;
    }
    if (!interactive || wantsHelp) {
      out(renderTopHelp(GROUPS, ENTRIES, workspace.version));
      return wantsHelp ? EXIT.ok : EXIT.usage;
    }
    return runFromMenu(argv, workspace.root, workspace.version, interactive);
  }

  if (found.kind === 'group') {
    const own = ENTRIES.filter((e) => e.path[0] === found.group.name);
    const word = found.rest.find((a) => !a.startsWith('-'));
    if (word) {
      const near = suggest(word, own, []);
      process.stderr.write(
        `Unknown command '${found.group.name} ${word}'${near.length ? `. Did you mean ${near.map((n) => theme.code(n)).join(', ')}?` : ''}\n`
      );
      return EXIT.usage;
    }
    if (!interactive || wantsHelp) {
      out(renderGroupHelp(found.group, own));
      return wantsHelp ? EXIT.ok : EXIT.usage;
    }
    return runFromMenu(
      found.rest,
      workspace.root,
      workspace.version,
      interactive,
      found.group.name
    );
  }

  const command = await found.entry.load();
  return runCommand({
    name: nameOf(found.entry),
    command,
    argv: found.rest,
    root: workspace.root,
    env: process.env,
    prefs: loadPrefs(),
    interactive
  });
}

async function runFromMenu(
  argv: string[],
  root: string,
  version: string,
  interactive: boolean,
  group?: string
): Promise<number> {
  console.clear();
  out(banner(version));
  out('');
  out(`  ${MENU_LEGEND}`);
  out('');
  const entry = await pickFromMenu(createTerminalUi(), GROUPS, ENTRIES, group);
  const command = await entry.load();
  return runCommand({
    name: nameOf(entry),
    command,
    argv,
    root,
    env: process.env,
    prefs: loadPrefs(),
    interactive
  });
}

main(process.argv.slice(2))
  .then((code) => {
    process.exitCode = code;
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
