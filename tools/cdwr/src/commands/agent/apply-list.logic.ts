/** An app Fly runs for the platform: the host cms, or a cms or headless client of a tenant */
export const APP = /^cdwr-cms$|^cdwr-(cms|headless)-[a-z0-9][a-z0-9-]*$/;

/** The machine counts an apply list may scale to */
export const COUNT = /^[1-4]$/;

/** A migration of the agent-queue telemetry database */
export const MIGRATION =
  /^tools\/cdwr\/agent-queue\/supabase\/migrations\/[0-9]{14}_[a-z0-9_]+\.sql$/;

/** The name of a function of the agent-queue telemetry database */
export const FUNCTION = /^[a-z0-9][a-z0-9-]*$/;

const ITEM = /^\s*[-*] \[( |x|X)\] (.*)$/;
const SEPARATOR = ' · ';

export type ApplyItem = {
  /** The item text before the outcome, such as `scale cdwr-cms 2 after-deploy` */
  text: string;
  spec: string;
  kind: string;
  args: string[];
  afterDeploy: boolean;
  checked: boolean;
  dropped: boolean;
  /** What happened to the item, after ` · `; null while nothing has */
  outcome: string | null;
};

export type ApplyContext = {
  /** Projects of the apps release group */
  apps: string[];
  functionExists: (name: string) => boolean;
  /** Files the branch adds, relative to the repository root */
  addedFiles: string[];
};

const isHeader = (line: string): boolean =>
  line.trim().replace(/^\*\*/, '').replace(/\*\*$/, '').trim().toLowerCase() ===
  'apply list:';

function parseItem(match: RegExpMatchArray): ApplyItem {
  const checked = match[1] !== ' ';
  const text = (match[2] ?? '').trim();
  const at = text.indexOf(SEPARATOR);
  const spec = (at === -1 ? text : text.slice(0, at)).trim();
  const outcome = at === -1 ? null : text.slice(at + SEPARATOR.length).trim();
  const tokens = spec.split(/\s+/).filter((token) => token !== '');
  const afterDeploy =
    tokens.length > 1 && tokens[tokens.length - 1] === 'after-deploy';
  if (afterDeploy) tokens.pop();
  return {
    text,
    spec,
    kind: tokens[0] ?? '',
    args: tokens.slice(1),
    afterDeploy,
    checked,
    dropped: !checked && text.startsWith('~~'),
    outcome
  };
}

/** The items of the apply list in a comment body; none when it has no apply list */
export function parseApplyList(body: string): ApplyItem[] {
  const lines = body.split(/\r?\n/);
  const header = lines.findIndex(isHeader);
  if (header === -1) return [];
  const items: ApplyItem[] = [];
  for (const line of lines.slice(header + 1)) {
    if (line.trim() === '') continue;
    const match = ITEM.exec(line);
    if (!match) break;
    items.push(parseItem(match));
  }
  return items;
}

const arity = (n: number): string => `${n} argument${n === 1 ? '' : 's'}`;

/** Why an open item cannot be applied, or null when it can; checked and dropped items are not looked at */
export function validateItem(
  item: ApplyItem,
  ctx: ApplyContext
): string | null {
  if (item.checked || item.dropped) return null;
  const { kind, args } = item;
  const wrongCount = (n: number): string | null =>
    args.length === n ? null : `${kind} takes ${arity(n)}`;
  const badApp = (app: string): string | null =>
    APP.test(app) ? null : `bad app ${app}`;

  switch (kind) {
    case 'restart':
      return wrongCount(1) ?? badApp(args[0] ?? '');
    case 'scale': {
      const count = args[1] ?? '';
      return (
        wrongCount(2) ??
        badApp(args[0] ?? '') ??
        (COUNT.test(count) ? null : 'count must be 1–4')
      );
    }
    case 'deploy-workflow': {
      const [project = '', environment = ''] = args;
      return (
        wrongCount(2) ??
        (ctx.apps.includes(project)
          ? null
          : `${project} is not in the apps release group`) ??
        (environment === 'production' ? null : 'only production')
      );
    }
    case 'supabase-migration': {
      const file = args[0] ?? '';
      return (
        wrongCount(1) ??
        (MIGRATION.test(file) ? null : 'not a migration file') ??
        (ctx.addedFiles.includes(file)
          ? null
          : `the branch does not add ${file}`)
      );
    }
    case 'supabase-function': {
      const name = args[0] ?? '';
      return (
        wrongCount(1) ??
        (FUNCTION.test(name) && ctx.functionExists(name)
          ? null
          : `no function ${name}`)
      );
    }
    case 'agent-deploy':
      return wrongCount(0);
    default:
      return `unknown kind ${kind}`;
  }
}

/** The item line the NUC writes back once it has an outcome */
export const outcomeLine = (
  spec: string,
  outcome: string,
  ticked: boolean
): string => `- [${ticked ? 'x' : ' '}] ${spec}${SEPARATOR}${outcome}`;
