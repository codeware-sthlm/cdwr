import { isAbsolute, join } from 'node:path';

const SCRIPT = 'tools/cdwr/agent-queue/statusline.sh';

/** The settings file Claude Code reads: `$CLAUDE_CONFIG_DIR/settings.json`, else `~/.claude/settings.json` */
export const settingsPath = (
  env: Record<string, string | undefined>,
  home: string
): string =>
  join(env['CLAUDE_CONFIG_DIR'] || join(home, '.claude'), 'settings.json');

/** The command Claude Code runs for the status line; the path is single-quoted, so none may hold a quote */
export const statuslineCommand = (root: string): string | undefined => {
  if (!isAbsolute(root) || root.includes("'")) return undefined;
  return `/bin/zsh '${join(root, SCRIPT)}'`;
};

export type StatuslinePlan =
  | { kind: 'install'; next: string }
  | { kind: 'current' }
  | { kind: 'taken'; current: unknown }
  | { kind: 'invalid' };

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** What to do with the settings text (undefined when the file is missing) for the given command */
export const planStatusline = (
  settingsText: string | undefined,
  command: string
): StatuslinePlan => {
  let settings: Record<string, unknown> = {};
  if (settingsText !== undefined) {
    try {
      const parsed: unknown = JSON.parse(settingsText);
      if (!isObject(parsed)) return { kind: 'invalid' };
      settings = parsed;
    } catch {
      return { kind: 'invalid' };
    }
  }
  const current = settings['statusLine'];
  if (current !== undefined) {
    return isObject(current) && current['command'] === command
      ? { kind: 'current' }
      : { kind: 'taken', current };
  }
  const next = { ...settings, statusLine: { type: 'command', command } };
  return { kind: 'install', next: `${JSON.stringify(next, null, 2)}\n` };
};
