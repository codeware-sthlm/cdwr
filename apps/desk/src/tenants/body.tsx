import type { ReactNode } from 'react';

import { KV } from '../desk/components/sheet-ui';
import { bytes, seenAgo } from '../desk/format';

import { versionCell } from './cells';
import type { TenantApp, TenantMachine } from './model';
import { SHARED_KEY } from './model';
import { sentryIssueUrl } from './problems';
import { Sparkline } from './sparkline';
import {
  DB_SESSIONS_MAX,
  type TenantEntry,
  certPending,
  certReady,
  isBehind
} from './status';
import { Chip, StatusChip } from './ui';

// What the tenant sheet shows: everything the NUC recorded for one row

const round1 = (n: number): number => Math.round(n * 10) / 10;

const HEADING =
  'text-[0.72rem] font-semibold tracking-[0.08em] text-[color:var(--muted)] uppercase';
const BOX =
  'flex min-w-0 flex-col gap-1.5 rounded-[var(--r-row)] border border-[color:var(--line)] px-3.5 py-3';
const MONO_LINE =
  'font-[family-name:var(--font-mono)] text-[12px] leading-[normal] text-[color:var(--muted)] [overflow-wrap:anywhere]';
const NOTE = 'text-[0.85rem] text-[color:var(--muted)]';

const Section = ({
  title,
  children
}: {
  title: string;
  children: ReactNode;
}) => (
  <section className="tn-section grid gap-2">
    <h3 className={HEADING}>{title}</h3>
    {children}
  </section>
);

/** A machine on main's commit is current; on another, the NUC's `behind` flag says whether that matters */
const versionNote = (
  sha: string,
  main: string | null,
  behind: boolean | null
): string =>
  main !== null && !isBehind(sha, main)
    ? ' (current)'
    : behind === true
      ? ' (behind)'
      : behind === false
        ? ' (current)'
        : '';

const Machine = ({
  m,
  main,
  behind
}: {
  m: TenantMachine;
  main: string | null;
  behind: boolean | null;
}) => (
  <li className={MONO_LINE}>
    {[
      m.id,
      m.state,
      m.region,
      m.memoryMb === null ? null : `${m.memoryMb} MB`,
      m.sha === null
        ? 'no commit'
        : `${m.sha.slice(0, 7)}${versionNote(m.sha, main, behind)}`
    ]
      .filter((part) => part !== null && part !== '')
      .join(' · ')}
  </li>
);

const App = ({ app, main }: { app: TenantApp; main: string | null }) => (
  <div className={`${BOX} tn-app`}>
    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
      <b className="font-[family-name:var(--font-mono)] text-[13px]">
        {app.app}
      </b>
      <Chip text={app.kind} tone="muted" />
      {app.health ? (
        <Chip
          text={
            app.health.ok
              ? `ok${app.health.ms === null ? '' : ` · ${Math.round(app.health.ms)} ms`}`
              : `down${app.health.status === null ? '' : ` · ${app.health.status}`}`
          }
          tone={app.health.ok ? 'ok' : 'bad'}
        />
      ) : (
        <Chip text="health unknown" tone="muted" />
      )}
    </div>
    {app.machines === null ? (
      <p className={NOTE}>The machines could not be read.</p>
    ) : app.machines.length ? (
      <ul className="grid gap-1">
        {app.machines.map((m) => (
          <Machine key={m.id} m={m} main={main} behind={app.behind} />
        ))}
      </ul>
    ) : (
      <p className={NOTE}>No machine.</p>
    )}
  </div>
);

export const TenantBody = ({
  entry,
  main,
  now
}: {
  entry: TenantEntry;
  main: string | null;
  now: Date;
}) => {
  const { row, status } = entry;
  const shared = row.key === SHARED_KEY;
  const errors = Object.entries(row.errors);
  const version = versionCell(row, main);
  return (
    <>
      <Section title="Summary">
        <dl className={KV}>
          <dt>Status</dt>
          <dd>
            <StatusChip status={status} />
          </dd>
          {row.status ? (
            <>
              <dt>Tenant</dt>
              <dd>{row.status}</dd>
            </>
          ) : null}
          {row.deployment ? (
            <>
              <dt>Deployment</dt>
              <dd>{row.deployment}</dd>
            </>
          ) : null}
          <dt>Version</dt>
          <dd>
            {version.text}
            {main ? ` · main ${main.slice(0, 7)}` : ''}
          </dd>
          <dt>Written</dt>
          <dd>
            {Number.isFinite(row.at)
              ? seenAgo(new Date(row.at).toISOString(), now)
              : '–'}
          </dd>
        </dl>
      </Section>

      <Section title="Apps">
        {row.apps.length ? (
          row.apps.map((a) => <App key={a.app} app={a} main={main} />)
        ) : (
          <p className={NOTE}>No app of this tenant is deployed.</p>
        )}
      </Section>

      {shared ? null : (
        <Section title="Domains">
          {row.domains.length ? (
            <ul className="grid gap-1.5">
              {row.domains.map((d) => (
                <li
                  key={d.hostname}
                  className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[0.88rem]"
                >
                  <span className="[overflow-wrap:anywhere]">{d.hostname}</span>
                  {d.primary ? <Chip text="primary" tone="muted" /> : null}
                  <Chip
                    text={`certificate ${d.certificate}`}
                    tone={
                      certReady(d.certificate)
                        ? 'ok'
                        : certPending(d.certificate)
                          ? 'wait'
                          : 'muted'
                    }
                  />
                  {d.app ? <span className={NOTE}>{d.app}</span> : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className={NOTE}>No domain.</p>
          )}
        </Section>
      )}

      <Section title="Deploy switches">
        {row.switches.length ? (
          <ul className="grid gap-1.5">
            {row.switches.map((s) => (
              <li
                key={`${s.app}/${s.environment}/${s.tenant ?? ''}`}
                className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[0.88rem]"
              >
                <span>{s.app}</span>
                <span className={NOTE}>
                  {s.environment}
                  {s.tenant ? ` · ${s.tenant}` : ' · host'}
                </span>
                <Chip text={s.flag} tone={s.flag === 'on' ? 'ok' : 'muted'} />
              </li>
            ))}
          </ul>
        ) : (
          <p className={NOTE}>No switch.</p>
        )}
      </Section>

      {row.db ? (
        <Section title="Database">
          <dl className={KV}>
            <dt>Sessions</dt>
            <dd>{`${row.db.sessions} of ${DB_SESSIONS_MAX}`}</dd>
            {row.db.sizeBytes === null ? null : (
              <>
                <dt>Size</dt>
                <dd>{bytes(row.db.sizeBytes)}</dd>
              </>
            )}
            {Object.entries(row.db.byApplication).map(([name, n]) => (
              <div key={name} className="contents">
                <dt>{name}</dt>
                <dd>{n}</dd>
              </div>
            ))}
          </dl>
        </Section>
      ) : null}

      {row.sentry ? (
        <Section title="Sentry">
          <dl className={KV}>
            <dt>Last 24 hours</dt>
            <dd>{row.sentry.count24h}</dd>
            <dt>Daily average, 7 days</dt>
            <dd>{round1(row.sentry.count7d / 7)}</dd>
            {row.sentry.top ? (
              <>
                <dt>Top issue</dt>
                <dd>
                  <a
                    className="tn-link underline"
                    href={sentryIssueUrl(
                      row.sentry.org,
                      row.sentry.top.shortId
                    )}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {row.sentry.top.shortId}
                  </a>{' '}
                  <span className="[overflow-wrap:anywhere]">
                    {`${row.sentry.top.level} · ${row.sentry.top.count}× · ${row.sentry.top.title}`}
                  </span>
                </dd>
              </>
            ) : null}
          </dl>
        </Section>
      ) : null}

      {row.visitors ? (
        <Section title="Visitors">
          <dl className={KV}>
            <dt>Today</dt>
            <dd>{row.visitors.today}</dd>
            <dt>Daily average, 7 days</dt>
            <dd>
              {row.visitors.days.length
                ? round1(
                    row.visitors.days.reduce((s, d) => s + d.visitors, 0) /
                      row.visitors.days.length
                  )
                : '–'}
            </dd>
          </dl>
          <Sparkline
            values={row.visitors.days.map((d) => d.visitors)}
            label={`Visitors per day, the last ${row.visitors.days.length} days`}
          />
        </Section>
      ) : null}

      <Section title="Errors">
        {errors.length ? (
          <ul className="grid gap-1.5">
            {errors.map(([source, line]) => (
              <li key={source} className="text-[0.88rem]">
                <b className="text-[color:var(--block)]">{source}</b>{' '}
                <span className="[overflow-wrap:anywhere]">{line}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className={NOTE}>None.</p>
        )}
      </Section>
    </>
  );
};
