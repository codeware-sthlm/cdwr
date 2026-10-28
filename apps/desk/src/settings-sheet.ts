import {
  type Settings,
  type SettingsField,
  type SettingsIssue,
  validateSettings
} from './settings';

export type SettingsSheetOptions = {
  /** What the form starts with; null on the first run. */
  current: Settings | null;
  /** Checks the live connection; returns the fields that failed. */
  verify: (settings: Settings) => Promise<SettingsIssue[]>;
  /** Stores the settings and starts the data layer on them. */
  onSaved: (settings: Settings) => Promise<void>;
};

const byId = (id: string): HTMLElement => {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing #${id}`);
  return node;
};

const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] => {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
};

type FieldSpec = {
  field: SettingsField;
  label: string;
  secret: boolean;
  placeholder: string;
};

const FIELD_SPECS: FieldSpec[] = [
  {
    field: 'linearKey',
    label: 'Linear API key',
    secret: true,
    placeholder: 'lin_api_…'
  },
  {
    field: 'supabaseUrl',
    label: 'Supabase project URL',
    secret: false,
    placeholder: 'https://<project-ref>.supabase.co'
  },
  {
    field: 'supabaseAnonKey',
    label: 'Supabase anon key',
    secret: true,
    placeholder: 'eyJ… or sb_publishable_…'
  }
];

/** Fills the page's own sheet with the settings form and shows it. */
export const openSettingsSheet = ({
  current,
  verify,
  onSaved
}: SettingsSheetOptions): void => {
  const sheet = byId('sheet');
  // A widget sheet may be open; the page's own close button closes it
  if (!sheet.hidden) byId('sheet-close').click();

  byId('sheet-title').textContent = 'Settings';
  byId('sheet-sub').textContent =
    'Kept on this computer. The desk reads Linear and Supabase with them.';

  const inputs = new Map<SettingsField, HTMLInputElement>();
  const errors = new Map<SettingsField, HTMLElement>();
  const secrets: HTMLInputElement[] = [];

  const rows = FIELD_SPECS.map(({ field, label, secret, placeholder }) => {
    const input = el('input', {
      id: `settings-${field}`,
      type: secret ? 'password' : 'text',
      value: current?.[field] ?? '',
      placeholder,
      autocomplete: 'off',
      spellcheck: false
    });
    input.setAttribute('autocapitalize', 'off');
    inputs.set(field, input);
    if (secret) secrets.push(input);
    const error = el('p', { className: 'settings-error', hidden: true });
    error.setAttribute('role', 'alert');
    errors.set(field, error);
    return el(
      'div',
      { className: 'settings-field' },
      el('label', { htmlFor: input.id }, label),
      input,
      error
    );
  });

  const show = el('button', { type: 'button' }, 'Show keys');
  show.setAttribute('aria-pressed', 'false');
  show.onclick = () => {
    const shown = show.getAttribute('aria-pressed') !== 'true';
    show.setAttribute('aria-pressed', String(shown));
    show.textContent = shown ? 'Hide keys' : 'Show keys';
    for (const input of secrets) input.type = shown ? 'text' : 'password';
  };

  const status = el('p', { className: 'settings-status' });
  status.setAttribute('role', 'status');
  const submit = el('button', { type: 'submit' }, 'Save');

  const setIssues = (issues: SettingsIssue[]): void => {
    for (const [field, node] of errors) {
      const issue = issues.find((i) => i.field === field);
      node.hidden = !issue;
      node.textContent = issue?.message ?? '';
    }
    if (issues.length > 0) inputs.get(issues[0].field)?.focus();
  };

  const form = el(
    'form',
    { className: 'settings', noValidate: true },
    el(
      'p',
      { className: 'settings-note' },
      'Create a read-only personal API key in Linear (Settings → Account → Security & access). The desk never writes to Linear.'
    ),
    el(
      'p',
      { className: 'settings-note' },
      'The anon key is in the Supabase project agent-queue, under Project Settings → API.'
    ),
    ...rows,
    el('div', { className: 'settings-actions' }, submit, show),
    status
  );

  form.onsubmit = (event) => {
    event.preventDefault();
    setIssues([]);
    const check = validateSettings({
      linearKey: inputs.get('linearKey')?.value ?? '',
      supabaseUrl: inputs.get('supabaseUrl')?.value ?? '',
      supabaseAnonKey: inputs.get('supabaseAnonKey')?.value ?? ''
    });
    if (!check.ok) {
      setIssues(check.issues);
      return;
    }
    submit.disabled = true;
    status.textContent = 'Checking the connection…';
    void (async () => {
      try {
        const issues = await verify(check.settings);
        if (issues.length > 0) {
          status.textContent = '';
          setIssues(issues);
          return;
        }
        await onSaved(check.settings);
        status.textContent = '';
        byId('sheet-close').click();
      } catch (error) {
        status.textContent =
          error instanceof Error
            ? `Could not save: ${error.message}`
            : 'Could not save.';
      } finally {
        submit.disabled = false;
      }
    })();
  };

  byId('sheet-body').replaceChildren(form);
  sheet.hidden = false;
  byId('scrim').hidden = false;
  inputs.get('linearKey')?.focus();
};

// The page closes its own sheets on Escape; it does not know this one
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  if (byId('sheet').hidden || !document.querySelector('form.settings')) return;
  byId('sheet-close').click();
});
