import { DEPLOYED } from '../../services/environment';

/** An app Fly runs for the platform: the host cms, or a cms or headless client of a tenant */
export const APP = /^cdwr-cms$|^cdwr-(cms|headless)-[a-z0-9][a-z0-9-]*$/;

/** The machine counts an apply list may scale to */
export const COUNT = /^[1-4]$/;

/** A migration of the agent-queue telemetry database */
export const MIGRATION =
  /^tools\/cdwr\/agent-queue\/supabase\/migrations\/[0-9]{14}_[a-z0-9_]+\.sql$/;

/** The name of a function of the agent-queue telemetry database */
export const FUNCTION = /^[a-z0-9][a-z0-9-]*$/;

/** The environments the NUC writes secrets in */
export const ENV = new RegExp(`^(${DEPLOYED.join('|')})$`);

/** An app folder in Infisical: `/apps/<app>` or `/tenants/<slug>/apps/<app>` */
export const FOLDER =
  /^\/(apps\/[a-z0-9][a-z0-9-]*|tenants\/[a-z0-9][a-z0-9-]*\/apps\/[a-z0-9][a-z0-9-]*)$/;

/** A secret key */
export const SECRET_KEY = /^[A-Z][A-Z0-9_]*$/;

/** Keys no secret kind may read or write */
export const FORBIDDEN_KEYS: readonly string[] = [
  'DEPLOY_ENABLED',
  'SITE_GATE_PASSWORD'
];

/** Key endings that mark a secret, which `secret-set` never writes */
export const SECRET_SUFFIX = /_(SECRET|PASSWORD|TOKEN|KEY)$/;

export const REWRITE_HOST = /^[a-z0-9.-]+$/;
export const REWRITE_USER = /^[a-z0-9._-]+$/;
/** A port without a leading zero, as the NUC reads it */
export const REWRITE_PORT = /^[1-9][0-9]{0,4}$/;

/** The parts `secret-rewrite` can change */
export const REWRITE_PARTS = ['host', 'port', 'user'] as const;
export type RewritePart = (typeof REWRITE_PARTS)[number];

const SET_NUMBER = /^[0-9]+$/;

/** Why a key cannot be used by a secret kind, or null */
export const keyProblem = (key: string): string | null =>
  FORBIDDEN_KEYS.includes(key)
    ? `${key} is off limits`
    : SECRET_KEY.test(key)
      ? null
      : `bad key ${key}`;

/** Why an environment and folder cannot be used by a secret kind, or null */
export const placeProblem = (env: string, folder: string): string | null =>
  (ENV.test(env) ? null : 'only production or preview') ??
  (FOLDER.test(folder) ? null : `bad folder ${folder}`);

/** Whether a value is an https url without credentials, query or fragment */
export const isPlainHttpsUrl = (value: string): boolean => {
  if (!value.startsWith('https://')) return false;
  const authority = value.slice('https://'.length).split('/')[0] ?? '';
  if (authority === '' || authority.includes('@')) return false;
  if (/[\s\p{Cc}?#]/u.test(value)) return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      url.username === '' &&
      url.password === '' &&
      url.search === '' &&
      url.hash === ''
    );
  } catch {
    return false;
  }
};

/** Why a `secret-set` key and value are refused, or null */
export const setProblem = (key: string, value: string): string | null => {
  const bad = keyProblem(key);
  if (bad) return bad;
  if (SECRET_SUFFIX.test(key)) return `${key} looks like a secret`;
  const plain = SET_NUMBER.test(value) || value === 'true' || value === 'false';
  if (!plain && !isPlainHttpsUrl(value)) {
    return 'value must be a number, true, false or an https url without credentials';
  }
  if (key.endsWith('_URL') && !isPlainHttpsUrl(value)) {
    return `${key} must be an https url without credentials`;
  }
  return null;
};

/** Why a rewrite part is refused, or null */
export const rewritePartProblem = (
  part: string,
  value: string
): string | null => {
  switch (part) {
    case 'host':
      return REWRITE_HOST.test(value) ? null : `bad host ${value}`;
    case 'port': {
      const port = Number(value);
      return REWRITE_PORT.test(value) && port <= 65535
        ? null
        : 'port must be 1–65535';
    }
    case 'user':
      return REWRITE_USER.test(value) ? null : `bad user ${value}`;
    default:
      return `unknown part ${part}`;
  }
};

/** Why the `part=value` arguments of `secret-rewrite` are refused, or null */
export function rewritePartsProblem(parts: readonly string[]): string | null {
  if (parts.length === 0) return 'secret-rewrite needs host=, port= or user=';
  const seen = new Set<string>();
  for (const arg of parts) {
    const at = arg.indexOf('=');
    const part = at === -1 ? arg : arg.slice(0, at);
    const value = at === -1 ? '' : arg.slice(at + 1);
    if (seen.has(part)) return `${part} given twice`;
    seen.add(part);
    const bad = rewritePartProblem(part, value);
    if (bad) return bad;
  }
  return null;
}

/** Why a `secret-copy` environment, folder and keys are refused, or null */
export const copyProblem = (
  environment: string,
  folder: string,
  from: string,
  to: string
): string | null =>
  placeProblem(environment, folder) ??
  keyProblem(from) ??
  keyProblem(to) ??
  (from === to ? 'from and to are the same key' : null);

/** Why a `secret-set` environment, folder, key and value are refused, or null */
export const setConfigProblem = (
  environment: string,
  folder: string,
  key: string,
  value: string
): string | null =>
  placeProblem(environment, folder) ??
  keyProblem(key) ??
  setProblem(key, value);

/** Why a `secret-rewrite` environment, folder, key and `part=value` arguments are refused, or null */
export const rewriteProblem = (
  environment: string,
  folder: string,
  key: string,
  parts: readonly string[]
): string | null =>
  placeProblem(environment, folder) ??
  keyProblem(key) ??
  rewritePartsProblem(parts);

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
    case 'nuc-install':
      return wrongCount(0);
    case 'secret-copy': {
      const [env = '', folder = '', from = '', to = ''] = args;
      return wrongCount(4) ?? copyProblem(env, folder, from, to);
    }
    case 'secret-rewrite': {
      const [env = '', folder = '', key = '', ...parts] = args;
      return (
        (args.length < 4 || args.length > 6
          ? 'secret-rewrite takes <env> <folder> <key> and 1–3 parts'
          : null) ?? rewriteProblem(env, folder, key, parts)
      );
    }
    case 'secret-set': {
      const [env = '', folder = '', key = '', value = ''] = args;
      return wrongCount(4) ?? setConfigProblem(env, folder, key, value);
    }
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
