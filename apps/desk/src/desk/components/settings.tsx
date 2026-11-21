import {
  Field,
  FieldError,
  FieldLabel
} from '@codeware/shared/ui/shadcn/components/field';
import { Input } from '@codeware/shared/ui/shadcn/components/input';
import { type FormEvent, useEffect, useRef, useState } from 'react';

import {
  type Settings,
  type SettingsField,
  type SettingsIssue,
  validateSettings
} from '../../settings';

export type SettingsOptions = {
  /** What the form starts with; null on the first run */
  current: Settings | null;
  /** Checks the live connection; returns the fields that failed */
  verify: (settings: Settings) => Promise<SettingsIssue[]>;
  /** Stores the settings and starts the data layer on them */
  onSaved: (settings: Settings) => Promise<void>;
};

export const SETTINGS_TITLE = 'Settings';
export const SETTINGS_SUB =
  'Kept on this computer. The desk reads Linear and Supabase with them.';

const NOTE = 'text-[0.85rem] text-[color:var(--muted)]';

type FieldSpec = {
  field: SettingsField;
  label: string;
  secret: boolean;
  placeholder: string;
};

const FIELD_SPECS: readonly FieldSpec[] = [
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
  },
  {
    field: 'controlToken',
    label: 'Desk control token (optional)',
    secret: true,
    placeholder: 'Empty keeps the desk read-only'
  }
];

const blank = (current: Settings | null): Record<SettingsField, string> => ({
  linearKey: current?.linearKey ?? '',
  supabaseUrl: current?.supabaseUrl ?? '',
  supabaseAnonKey: current?.supabaseAnonKey ?? '',
  controlToken: current?.controlToken ?? ''
});

/** The settings form: validated here, checked against the live services, then saved and closed */
export const SettingsForm = ({
  current,
  verify,
  onSaved,
  onDone
}: SettingsOptions & { onDone: () => void }) => {
  const [values, setValues] = useState(() => blank(current));
  const [issues, setIssues] = useState<SettingsIssue[]>([]);
  const [shown, setShown] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const inputs = useRef(new Map<SettingsField, HTMLInputElement>());
  // Focus moves to the first field with an issue once it shows
  const [focusOn, setFocusOn] = useState<SettingsField | null>('linearKey');

  useEffect(() => {
    if (!focusOn) return;
    inputs.current.get(focusOn)?.focus();
    setFocusOn(null);
  }, [focusOn]);

  const showIssues = (next: SettingsIssue[]) => {
    setIssues(next);
    if (next.length > 0) setFocusOn(next[0].field);
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    showIssues([]);
    const check = validateSettings(values);
    if (!check.ok) {
      showIssues(check.issues);
      return;
    }
    setBusy(true);
    setStatus('Checking the connection…');
    void (async () => {
      try {
        const found = await verify(check.settings);
        if (found.length > 0) {
          setStatus('');
          showIssues(found);
          return;
        }
        await onSaved(check.settings);
        setStatus('');
        onDone();
      } catch (error) {
        setStatus(
          error instanceof Error
            ? `Could not save: ${error.message}`
            : 'Could not save.'
        );
      } finally {
        setBusy(false);
      }
    })();
  };

  return (
    <form className="settings grid gap-[14px]" noValidate onSubmit={submit}>
      <p className={`settings-note ${NOTE}`}>
        Create a personal API key in Linear (Settings → Account → Security &
        access). Give it write scope (or issues:create) to use Label
        agent:ready; a read-only key works for everything else.
      </p>
      <p className={`settings-note ${NOTE}`}>
        The anon key is in the Supabase project agent-queue, under Project
        Settings → API.
      </p>
      <p className={`settings-note ${NOTE}`}>
        The control token lets this desk pause, run and limit the queue. It is
        the device token whose hash is in DESK_CONTROL_TOKENS; leave it empty to
        only watch.
      </p>
      {FIELD_SPECS.map(({ field, label, secret, placeholder }) => {
        const issue = issues.find((i) => i.field === field);
        const id = `settings-${field}`;
        return (
          <Field key={field} className="gap-1" data-invalid={Boolean(issue)}>
            <FieldLabel htmlFor={id} className="text-[0.8rem] font-semibold">
              {label}
            </FieldLabel>
            <Input
              id={id}
              ref={(el) => {
                if (el) inputs.current.set(field, el);
              }}
              type={secret && !shown ? 'password' : 'text'}
              value={values[field]}
              onChange={(e) =>
                setValues((v) => ({ ...v, [field]: e.target.value }))
              }
              placeholder={placeholder}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              aria-invalid={issue ? true : undefined}
              className="h-auto rounded-[8px] border-[var(--line)] bg-[var(--sunk)] px-2.5 py-2 font-[family-name:var(--font-mono)] text-[0.85rem] md:text-[0.85rem]"
            />
            {issue && (
              <FieldError className="text-[0.82rem] text-[var(--block)]">
                {issue.message}
              </FieldError>
            )}
          </Field>
        );
      })}
      <div className="settings-actions flex gap-[10px]">
        <button type="submit" disabled={busy}>
          Save
        </button>
        <button
          type="button"
          aria-pressed={shown}
          onClick={() => setShown((s) => !s)}
        >
          {shown ? 'Hide keys' : 'Show keys'}
        </button>
      </div>
      <p className={`settings-status ${NOTE}`} role="status">
        {status}
      </p>
    </form>
  );
};
