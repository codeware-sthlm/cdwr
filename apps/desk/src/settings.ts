export type Settings = {
  linearKey: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
};

export type SettingsField = keyof Settings;

export type SettingsIssue = { field: SettingsField; message: string };

export type SettingsCheck =
  { ok: true; settings: Settings } | { ok: false; issues: SettingsIssue[] };

const SUPABASE_URL = /^https:\/\/[a-z0-9]{20}\.supabase\.co$/;
const JWT_SHAPE = /^[\w-]+\.[\w-]+\.[\w-]+$/;
const PUBLISHABLE_PREFIX = 'sb_publishable_';
const LINEAR_PREFIX = 'lin_api_';

const linearKeyIssue = (key: string): string | undefined => {
  if (key === '') return 'Enter a Linear personal API key.';
  if (/\s/.test(key)) return 'The key must not contain spaces or line breaks.';
  if (!key.startsWith(LINEAR_PREFIX))
    return `A Linear personal API key starts with ${LINEAR_PREFIX}.`;
  return undefined;
};

const supabaseUrlIssue = (url: string): string | undefined => {
  if (url === '') return 'Enter the Supabase project URL.';
  if (!SUPABASE_URL.test(url))
    return 'Use the project URL, https://<project-ref>.supabase.co.';
  return undefined;
};

const anonKeyIssue = (key: string): string | undefined => {
  if (key === '') return 'Enter the Supabase anon key.';
  if (/\s/.test(key)) return 'The key must not contain spaces or line breaks.';
  const publishable =
    key.startsWith(PUBLISHABLE_PREFIX) &&
    key.length > PUBLISHABLE_PREFIX.length;
  if (!publishable && !JWT_SHAPE.test(key))
    return 'Expected the anon key (a JWT) or a publishable key (sb_publishable_…).';
  return undefined;
};

/** Trims the values, then checks each field; the settings come back normalized. */
export const validateSettings = (input: Settings): SettingsCheck => {
  const settings: Settings = {
    linearKey: input.linearKey.trim(),
    supabaseUrl: input.supabaseUrl.trim().replace(/\/+$/, ''),
    supabaseAnonKey: input.supabaseAnonKey.trim()
  };
  const found: [SettingsField, string | undefined][] = [
    ['linearKey', linearKeyIssue(settings.linearKey)],
    ['supabaseUrl', supabaseUrlIssue(settings.supabaseUrl)],
    ['supabaseAnonKey', anonKeyIssue(settings.supabaseAnonKey)]
  ];
  const issues = found.flatMap(([field, message]) =>
    message === undefined ? [] : [{ field, message }]
  );
  return issues.length > 0 ? { ok: false, issues } : { ok: true, settings };
};

/** The part of the Tauri store the desk uses, so specs can fake it. */
export type KeyValueStore = {
  get: (key: string) => Promise<unknown>;
  set: (key: string, value: string) => Promise<void>;
  save: () => Promise<void>;
};

const FIELDS: readonly SettingsField[] = [
  'linearKey',
  'supabaseUrl',
  'supabaseAnonKey'
];

/** The stored settings, or null when any is missing or invalid. */
export const loadSettings = async (
  store: KeyValueStore
): Promise<Settings | null> => {
  const [linearKey, supabaseUrl, supabaseAnonKey] = await Promise.all(
    FIELDS.map((field) => store.get(field))
  );
  if (
    typeof linearKey !== 'string' ||
    typeof supabaseUrl !== 'string' ||
    typeof supabaseAnonKey !== 'string'
  )
    return null;
  const check = validateSettings({ linearKey, supabaseUrl, supabaseAnonKey });
  return check.ok ? check.settings : null;
};

export const saveSettings = async (
  store: KeyValueStore,
  settings: Settings
): Promise<void> => {
  for (const field of FIELDS) await store.set(field, settings[field]);
  await store.save();
};
