import { type FormEvent, useState } from 'react';

import {
  type CommandArgs,
  CommandError,
  type CommandReply,
  type PlatformCommandKind,
  type PlatformCommandState,
  platformCommandKey
} from '../desk/commands';

import type { TenantApp, TenantRow } from './model';

// A tenant's actions on its sheet: restart an app, close or open the site. The commands go to the
// host that writes `tenant_state` and the NUC's scheduler applies them; each asks for the tenant's
// slug first. The desk never sends or asks for the gate's password.

/** What the sheet's actions use; `can` is false without a control token */
export type PlatformApi = {
  can: boolean;
  /** The host the commands go to, null when none applies them (`platformHost`) */
  host: string | null;
  /** `platformCommandKey` -> where each command stands */
  commands: ReadonlyMap<string, PlatformCommandState>;
  send: (
    host: string,
    kind: PlatformCommandKind,
    args: CommandArgs
  ) => Promise<CommandReply>;
};

export const NO_HOST_TITLE = 'No host applies platform commands.';

const BUTTON =
  'inline-flex min-h-8 items-center rounded-[10px] border px-3.5 py-0 text-[12px] font-semibold disabled:opacity-50 max-[600px]:min-h-[var(--tap)]';
const BUTTON_QUIET = `${BUTTON} border-[color:var(--line)] bg-transparent text-[color:var(--fg)]`;
const BUTTON_DANGER = `${BUTTON} border-[color:var(--block)] bg-transparent text-[color:var(--block)]`;
const NOTE =
  'font-[family-name:var(--font-mono)] text-[11px] leading-[normal] text-[color:var(--muted)] [overflow-wrap:anywhere]';
const INPUT =
  'min-h-8 rounded-[10px] border border-[color:var(--line)] bg-transparent px-2.5 text-[12px] text-[color:var(--fg)]';

/** An app reads as down when its health check failed or none of its machines is started */
export const appDown = (app: TenantApp): boolean =>
  app.health?.ok === false ||
  (app.machines !== null &&
    !app.machines.some((machine) => machine.state === 'started'));

/** The one commit all of an app's machines carry; null without a machine or when they differ */
export const sharedSha = (app: TenantApp): string | null => {
  const shas = new Set((app.machines ?? []).map((machine) => machine.sha));
  const [sha] = shas;
  return shas.size === 1 && typeof sha === 'string' ? sha : null;
};

/** Which gate buttons to show: Open when any app reads gated, Close when one reads open, both when none is known */
export const gateActions = (
  apps: readonly TenantApp[]
): ('open' | 'close')[] => {
  const known = apps.flatMap((app) => (app.gated === null ? [] : [app.gated]));
  if (known.includes(true)) return ['open'];
  return known.length ? ['close'] : ['close', 'open'];
};

type Item = {
  id: string;
  /** The `platformCommandKey` its state is kept under */
  key: string;
  text: string;
  danger: boolean;
  kind: PlatformCommandKind;
  args: CommandArgs;
};

const items = (row: TenantRow): { restarts: Item[]; gates: Item[] } => {
  const restarts = row.apps
    .filter((app) => app.kind === 'cms')
    .map((app): Item => ({
      id: `restart ${app.app}`,
      key: platformCommandKey('restart', app.app),
      text: `Restart ${app.app}`,
      danger: appDown(app),
      kind: 'restart',
      args: { tenant: row.key, app: app.app, sha: sharedSha(app) }
    }));
  const gates = gateActions(row.apps).map((action): Item => ({
    id: `gate ${action}`,
    key: platformCommandKey('gate', row.key),
    text: action === 'close' ? 'Close site' : 'Open site',
    danger: false,
    kind: 'gate',
    args: { tenant: row.key, action }
  }));
  return { restarts, gates };
};

export const TenantActions = ({
  row,
  api
}: {
  row: TenantRow;
  api: PlatformApi;
}) => {
  const [asking, setAsking] = useState<string | null>(null);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState<Record<string, string>>({});
  const { restarts, gates } = items(row);
  const slug = row.key;

  const pick = (item: Item) => {
    setAsking(item.id);
    setTyped('');
    setFailed((all) => ({ ...all, [item.key]: '' }));
  };

  const confirm = (event: FormEvent, item: Item) => {
    event.preventDefault();
    if (typed !== slug || api.host === null) return;
    setAsking(null);
    setBusy(item.key);
    api
      .send(api.host, item.kind, item.args)
      .catch((error: unknown) => {
        setFailed((all) => ({
          ...all,
          [item.key]:
            error instanceof CommandError
              ? error.message
              : 'The command failed.'
        }));
      })
      .finally(() => setBusy(null));
  };

  const button = (item: Item) => {
    const state = api.commands.get(item.key);
    const sending = busy === item.key || state?.state === 'pending';
    return (
      <button
        key={item.id}
        type="button"
        className={item.danger ? BUTTON_DANGER : BUTTON_QUIET}
        data-platform={item.id}
        disabled={api.host === null || sending}
        title={api.host === null ? NO_HOST_TITLE : undefined}
        onClick={() => pick(item)}
      >
        {sending ? `${item.text}…` : item.text}
      </button>
    );
  };

  const status = (item: Item) => {
    const state = api.commands.get(item.key);
    const text =
      failed[item.key] ||
      (state?.state === 'refused'
        ? state.note
        : state?.state === 'applied'
          ? 'applied'
          : state?.state === 'pending'
            ? 'pending: the NUC applies it on its next tick'
            : '');
    return text ? (
      <span className={NOTE} data-platform-status={item.key}>
        {text}
      </span>
    ) : null;
  };

  const asked = [...restarts, ...gates].find((item) => item.id === asking);
  const gateState = api.commands.get(platformCommandKey('gate', slug));
  const passwordApps = row.apps.filter(
    (app) => app.kind === 'cms' || app.kind === 'headless'
  );

  return (
    <div className="tn-actions grid gap-2">
      {restarts.length ? (
        <div className="flex flex-wrap items-center gap-2">
          {restarts.map((item) => (
            <span key={item.id} className="flex items-center gap-2">
              {button(item)}
              {status(item)}
            </span>
          ))}
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        {gates.map(button)}
        {gates.length ? status(gates[0]) : null}
      </div>
      {asked ? (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(event) => confirm(event, asked)}
        >
          <label className={NOTE} htmlFor="tn-confirm">
            Type {slug} to confirm
          </label>
          <input
            id="tn-confirm"
            className={INPUT}
            value={typed}
            autoComplete="off"
            onChange={(event) => setTyped(event.target.value)}
          />
          <button
            type="submit"
            className={asked.danger ? BUTTON_DANGER : BUTTON_QUIET}
            disabled={typed !== slug}
          >
            {`Confirm: ${asked.text}`}
          </button>
          <button
            type="button"
            className={BUTTON_QUIET}
            onClick={() => setAsking(null)}
          >
            Cancel
          </button>
        </form>
      ) : null}
      {gateState?.state === 'applied' && gateState.action === 'close' ? (
        <div className="grid gap-0.5" data-platform-password>
          <span className={NOTE}>The password is in Infisical:</span>
          {passwordApps.map((app) => (
            <span key={app.app} className={NOTE}>
              {`/tenants/${slug}/apps/${app.kind} SITE_GATE_PASSWORD`}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
};
