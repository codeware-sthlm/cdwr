import { type ReactNode, useState } from 'react';

import {
  type PrCommandState,
  dropCommandKey,
  dropCommandStates
} from '../commands';
import { dayTime } from '../format';
import type { Model } from '../model';
import { type ApplyItem, parseDeploy } from '../parsers';
import type { DeskState } from '../state';
import type { DeployState } from '../types';
import { NOTE_MAX } from '../view/review';

import { WNOTE, WSNOOZE_CARD } from './before';
import { META } from './items-ui';

// Drop: strikes an open hand-off or Apply list line of a merged ticket, which the agent's comment holds and Håkan cannot edit

/** The longest line the desk-command function takes as an item */
export const ITEM_MAX = 500;

/** What the Drop buttons need, built once per sheet */
export type DropCtx = {
  state: DeskState;
  now: Date;
  /** The controls are on and a host publishes queue_state */
  can: boolean;
  /** Each line's Drop command, by `dropCommandKey` */
  commands: ReadonlyMap<string, PrCommandState>;
  /** The newest self-deploy of the host the commands go to; null when it reports none */
  deploy: DeployState | null;
  onDrop: (ticket: string, item: string, note: string) => void;
};

export const dropCtx = (
  m: Model,
  state: DeskState,
  now: Date,
  onDrop: DropCtx['onDrop']
): DropCtx => {
  const host = m.controls?.host ?? state.data.runs?.host ?? null;
  const raw =
    host === null
      ? undefined
      : (state.data.runs?.deploys ?? []).find((d) => d.host === host)?.deploy;
  return {
    state,
    now,
    can: m.controls !== null && state.controls.target !== null,
    commands: dropCommandStates(state.data.deskCommands ?? [], now.getTime()),
    deploy: parseDeploy(raw) ?? null,
    onDrop
  };
};

/** An Apply list item the scheduler refused: it is never retried */
export const isRefused = (a: ApplyItem): boolean =>
  !a.checked && !a.dropped && (a.outcome?.startsWith('refused') ?? false);

/** What to do by hand for an item the scheduler will not retry */
const byHand = (a: ApplyItem): ReactNode => {
  if (a.kind === 'agent-deploy')
    return <code>cdwr agent deploy --host agent-host</code>;
  if (a.kind === 'nuc-install') return "the host's install";
  if (a.kind === 'restart' && a.args[0])
    return <code>cdwr fly restart {a.args[0]}</code>;
  return <code>{a.spec}</code>;
};

/** The healthy self-deploy since the merge that makes an agent-deploy or nuc-install item moot; null when none */
export const deployedSince = (
  deploy: DeployState | null,
  kind: string,
  completedAt: string | null
): DeployState | null =>
  deploy !== null &&
  (kind === 'agent-deploy' || kind === 'nuc-install') &&
  deploy.phase === 'ok' &&
  completedAt !== null &&
  Date.parse(deploy.at) > Date.parse(completedAt)
    ? deploy
    : null;

/** Drop with an optional reason, or where the command stands; nothing without controls */
export const DropControl = ({
  ctx,
  ticket,
  item
}: {
  ctx: DropCtx;
  ticket: string;
  item: string;
}) => {
  const [reason, setReason] = useState('');
  if (!ctx.can || !item || item.length > ITEM_MAX) return null;
  const key = dropCommandKey(ticket, item);
  const sent = ctx.commands.get(key);
  const c = ctx.state.controls;
  const busy = c.dropSending.has(key) || sent?.state === 'pending';
  const note =
    c.dropNotes.get(key) ?? (sent?.state === 'refused' ? sent.note : '');
  if (sent?.state === 'applied') return <span className={WNOTE}>dropped</span>;
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-2">
      <input
        type="text"
        className="min-w-0 rounded-[8px] border border-[color:var(--line)] bg-[color:var(--sunk)] px-2.5 py-1.5 text-[0.85rem]"
        aria-label={`Reason for dropping ${item}`}
        placeholder="Why (optional)"
        maxLength={NOTE_MAX}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />
      <button
        type="button"
        className={WSNOOZE_CARD}
        data-drop={ticket}
        aria-label={`Drop ${item}`}
        disabled={busy}
        onClick={() => ctx.onDrop(ticket, item, reason)}
      >
        {busy ? 'Dropping…' : 'Drop'}
      </button>
      {note ? <span className={WNOTE}>{note}</span> : null}
    </span>
  );
};

/**
 * What follows an open Apply list item: the hint for a refused one, the deploy that made a
 * deploy item moot, and Drop when `droppable` (the ticket is Done). Nothing for a ticked or dropped item.
 */
export const ApplyExtras = ({
  ctx,
  a,
  ticket,
  completedAt,
  droppable
}: {
  ctx: DropCtx;
  a: ApplyItem;
  ticket: string;
  completedAt: string | null;
  droppable: boolean;
}) => {
  if (a.checked || a.dropped) return null;
  const since = deployedSince(ctx.deploy, a.kind, completedAt);
  return (
    <>
      {isRefused(a) ? (
        <span className={META} data-refused-hint="">
          Refused items are never retried: drop it, or do it by hand:{' '}
          {byHand(a)}
        </span>
      ) : null}
      {since ? (
        <span className={META} data-deployed-since="">
          deployed since: {since.tag} at{' '}
          {dayTime(Date.parse(since.at), ctx.now.getTime())}, safe to drop
        </span>
      ) : null}
      {droppable ? (
        <DropControl ctx={ctx} ticket={ticket} item={a.text} />
      ) : null}
    </>
  );
};
