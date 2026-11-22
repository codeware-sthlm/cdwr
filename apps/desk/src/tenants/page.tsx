import {
  SHARED_KEY,
  type TenantDb
} from '@codeware/shared/util/platform-problems';
import { useState } from 'react';

import { CAP_SUB } from '../desk/components/capacity';
import { PANEL } from '../desk/components/card-ui';
import { PHONE, Sheet, useMedia } from '../desk/components/sheet';
import { ageText } from '../desk/format';
import type { TenantsPayload } from '../supabase';

import type { PlatformApi } from './actions';
import { TenantBody } from './body';
import {
  type Cell,
  appCell,
  certCell,
  compactLine,
  healthCell,
  sessionsCell,
  switchesCell,
  versionCell
} from './cells';
import { NeedsYou, ProblemBody, ProblemSummary } from './problem-cards';
import {
  TENANTS_STALE_MIN,
  type TenantEntry,
  type TenantsView,
  tenantsView
} from './status';
import { StatusChip, TEXT_TONE } from './ui';

// The Platform view: one row per tenant and the shared one, production's state as the NUC reads it.
// Read-only apart from the sheet's restart and gate actions. A row opens a sheet with everything for it; which one is open is this page's own state.

const EMPTY_TEXT = 'No platform data yet — the NUC writes it every 10 minutes.';

const COLUMNS = [
  'Tenant',
  'Status',
  'cms',
  'headless',
  'Version',
  'Health',
  'Certificate',
  'DB sessions',
  'Switches'
] as const;

const GRID =
  'grid grid-cols-[minmax(150px,1.6fr)_64px_repeat(7,minmax(76px,1fr))] items-center gap-x-3';
const ROW_BOX =
  'tn-row w-full min-h-[var(--tap)] cursor-pointer rounded-[var(--r-row)] border border-[color:var(--line)] bg-[color:var(--surface)] px-4 py-2.5 text-left font-[family-name:var(--font-ui)] text-[13px] font-normal hover:border-[color:var(--line-strong)] data-[problem=true]:border-l-[3px] data-[problem=true]:border-l-[color:var(--block)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--accent)]';
const MONO =
  'font-[family-name:var(--font-mono)] text-[11px] leading-[normal] font-normal';

const nameOf = (entry: TenantEntry): string =>
  entry.row.key === SHARED_KEY ? 'Shared' : (entry.row.name ?? entry.row.key);

const Value = ({ cell, col }: { cell: Cell; col: string }) => (
  <span
    className={`${MONO} ${TEXT_TONE[cell.tone]} min-w-0 truncate`}
    data-col={col}
  >
    {cell.text}
  </span>
);

const TenantLine = ({
  entry,
  main,
  db,
  phone,
  problem,
  onOpen
}: {
  entry: TenantEntry;
  main: string | null;
  db: TenantDb | null;
  phone: boolean;
  /** Whether the row has an open problem */
  problem: boolean;
  onOpen: (key: string) => void;
}) => {
  const { row, status } = entry;
  const shared = row.key === SHARED_KEY;
  return (
    <li>
      <button
        type="button"
        className={
          phone ? `${ROW_BOX} flex flex-col gap-1.5` : `${ROW_BOX} ${GRID}`
        }
        data-tenant={row.key}
        data-status={status}
        data-problem={problem}
        onClick={() => onOpen(row.key)}
      >
        {phone ? (
          <>
            <span className="flex min-w-0 items-center justify-between gap-3">
              <b className="min-w-0 truncate font-semibold">{nameOf(entry)}</b>
              <StatusChip status={status} />
            </span>
            <span
              className={`${MONO} min-w-0 truncate text-[color:var(--muted)]`}
            >
              {compactLine(row, main) ||
                (shared ? 'host apps and database' : 'no app')}
            </span>
          </>
        ) : (
          <>
            <b className="min-w-0 truncate font-semibold">{nameOf(entry)}</b>
            <StatusChip status={status} />
            <Value col="cms" cell={appCell(row, 'cms')} />
            <Value col="headless" cell={appCell(row, 'headless')} />
            <Value col="version" cell={versionCell(row, main)} />
            <Value col="health" cell={healthCell(row)} />
            <Value col="certificate" cell={certCell(row)} />
            <Value col="sessions" cell={sessionsCell(row, db)} />
            <Value col="switches" cell={switchesCell(row)} />
          </>
        )}
      </button>
    </li>
  );
};

/** The alert band: the rows are older than the NUC's cadence allows */
const StaleBand = ({ ageMin }: { ageMin: number | null }) => (
  <div
    role="alert"
    className="tn-stale rounded-[10px] bg-[color:var(--wait-soft)] px-4 py-3 text-[0.9rem] text-[color:var(--wait)]"
  >
    {ageMin === null
      ? 'The platform data carries no readable time, so it may be stale.'
      : `The platform data was last written ${ageText(ageMin)}, more than ${TENANTS_STALE_MIN} min ago. The NUC writes it every 10 minutes, so it may be down.`}
  </div>
);

type Props = {
  data: TenantsPayload | null;
  now: Date;
  /** The sheet's restart and gate actions; none without it */
  platform?: PlatformApi;
};

const Rows = ({
  view,
  now,
  platform
}: {
  view: Extract<TenantsView, { kind: 'ready' }>;
  now: Date;
  platform?: PlatformApi;
}) => {
  const phone = useMedia(PHONE);
  // The sheet keeps its row while it animates out
  const [sel, setSel] = useState<{ key: string; open: boolean } | null>(null);
  // Likewise the problem sheet, by the problem's key
  const [probSel, setProbSel] = useState<{
    key: string;
    open: boolean;
  } | null>(null);
  const all = view.shared ? [view.shared, ...view.tenants] : view.tenants;
  const picked = sel ? all.find((e) => e.row.key === sel.key) : undefined;
  const pickedProblem = probSel
    ? view.problems.find((p) => p.key === probSel.key)
    : undefined;
  const problemRows = new Set(view.problems.map((p) => p.row));
  const nameFor = (key: string): string => {
    const e = all.find((x) => x.row.key === key);
    return e ? nameOf(e) : key;
  };
  const db = view.shared?.row.db ?? null;
  return (
    <>
      <ProblemSummary problems={view.problems} />
      <NeedsYou
        problems={view.problems}
        nameOf={nameFor}
        onOpen={(key) => setProbSel({ key, open: true })}
      />
      {phone ? null : (
        <div
          className={`${GRID} tn-head px-4 text-[10px] font-medium tracking-[0.1em] text-[color:var(--muted)] uppercase`}
          aria-hidden="true"
        >
          {COLUMNS.map((c) => (
            <span key={c} className="truncate">
              {c}
            </span>
          ))}
        </div>
      )}
      <ul className="grid gap-2">
        {all.map((e) => (
          <TenantLine
            key={e.row.key}
            entry={e}
            main={view.main}
            db={db}
            phone={phone}
            problem={problemRows.has(e.row.key)}
            onOpen={(key) => setSel({ key, open: true })}
          />
        ))}
      </ul>
      {view.tenants.length ? null : (
        <p className="text-[0.9rem] text-[color:var(--muted)]">
          No tenant is recorded yet.
        </p>
      )}
      {picked ? (
        <Sheet
          open={sel?.open === true}
          title={nameOf(picked)}
          sub={
            picked.row.key === SHARED_KEY
              ? 'host apps and database'
              : `${picked.row.key} · ${picked.row.deployment ?? 'no deployment'}`
          }
          focus
          onClose={() => setSel((s) => (s ? { ...s, open: false } : s))}
          onClosed={() =>
            Array.from(document.querySelectorAll<HTMLElement>('[data-tenant]'))
              .find((el) => el.dataset['tenant'] === picked.row.key)
              ?.focus()
          }
        >
          <TenantBody
            entry={picked}
            main={view.main}
            now={now}
            platform={platform}
          />
        </Sheet>
      ) : null}
      {pickedProblem ? (
        <Sheet
          open={probSel?.open === true}
          title={pickedProblem.title}
          sub={`${nameFor(pickedProblem.row)} · ${pickedProblem.severity}`}
          focus
          onClose={() => setProbSel((s) => (s ? { ...s, open: false } : s))}
          onClosed={() =>
            Array.from(
              document.querySelectorAll<HTMLElement>('[data-problem-key]')
            )
              .find((el) => el.dataset['problemKey'] === pickedProblem.key)
              ?.focus()
          }
        >
          <ProblemBody
            problem={pickedProblem}
            row={all.find((e) => e.row.key === pickedProblem.row)?.row}
          />
        </Sheet>
      ) : null}
    </>
  );
};

export const TenantsPage = ({ data, now, platform }: Props) => {
  const view = tenantsView(data, now);
  return (
    <>
      {view.kind === 'ready' && view.stale ? (
        <StaleBand ageMin={view.ageMin} />
      ) : null}
      <div className="pf-head flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="pf-title mr-auto flex min-w-0 flex-col gap-0.5">
          <h1
            id="platform-title"
            tabIndex={-1}
            className="font-[family-name:var(--font-ui)] text-[22px] leading-[1.2] font-semibold tracking-[0.18em] uppercase focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[color:var(--accent)]"
          >
            Platform
          </h1>
          <span className={`cap-sub ${CAP_SUB}`}>
            production: the tenants and the shared host, their health and
            problems, as the NUC last read them
          </span>
        </div>
      </div>
      {view.kind === 'loading' ? (
        <div className={`${PANEL} text-[0.9rem] text-[color:var(--muted)]`}>
          Loading…
        </div>
      ) : view.kind === 'empty' ? (
        <div
          className={`${PANEL} tn-empty text-[0.9rem] text-[color:var(--muted)]`}
        >
          {EMPTY_TEXT}
        </div>
      ) : (
        <Rows view={view} now={now} platform={platform} />
      )}
    </>
  );
};
