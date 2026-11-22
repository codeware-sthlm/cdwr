import type { TenantRow } from '@codeware/shared/util/platform-problems';
import {
  type Problem,
  sentryIssueUrl
} from '@codeware/shared/util/platform-problems';
import type { ReactNode } from 'react';

import { plural } from '../desk/format';

import { Chip } from './ui';

// The tenants view's problems: the summary card, the "Needs you" cards and what a problem's sheet says

const HEADING =
  'text-[0.72rem] font-semibold tracking-[0.08em] text-[color:var(--muted)] uppercase';
const LABEL =
  'text-[11px] leading-[normal] font-medium font-[family-name:var(--font-mono)] tracking-[0.14em]';
const CARD =
  'tn-problem flex w-full min-h-[var(--tap)] cursor-pointer flex-col items-start gap-1.5 rounded-[var(--r-card)] border px-5 py-3.5 text-left font-[family-name:var(--font-ui)] text-[13px] font-normal hover:border-[color:var(--muted)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--accent)] max-[600px]:px-3.5 max-[600px]:py-3';
const SEVERITY_BOX: Record<Problem['severity'], string> = {
  down: 'border-[color:var(--problem-line)] bg-[color:var(--problem-bg)]',
  warn: 'border-[color:var(--line)] bg-[color:var(--wait-soft)]'
};
const LINK = 'tn-link underline [overflow-wrap:anywhere]';

/** The link a problem's sheet offers: the top Sentry issue, or the deploy run; null when there is none or it is not https */
export const problemLink = (
  p: Problem,
  row: TenantRow | undefined
): { href: string; text: string } | null => {
  if (!row) return null;
  if (p.kind === 'errors' && row.sentry?.top)
    return {
      href: sentryIssueUrl(row.sentry.org, row.sentry.top.shortId),
      text: `Open ${row.sentry.top.shortId} in Sentry`
    };
  if (p.kind === 'deploy' && row.deploy?.url.startsWith('https://'))
    return { href: row.deploy.url, text: `Open run ${row.deploy.runId}` };
  return null;
};

/** How many problems of each severity, and how many rows they touch, or all clear */
export const ProblemSummary = ({ problems }: { problems: Problem[] }) => {
  const down = problems.filter((p) => p.severity === 'down').length;
  const warn = problems.length - down;
  const rows = new Set(problems.map((p) => p.row)).size;
  return (
    <div
      className={`tn-summary rounded-[var(--r-card)] border px-5 py-3.5 text-[0.9rem] ${problems.length ? SEVERITY_BOX[down ? 'down' : 'warn'] : 'border-[color:var(--line)] bg-[color:var(--ok-soft)] text-[color:var(--ok)]'}`}
      data-problems={problems.length}
    >
      {problems.length ? (
        <>
          <b className="font-semibold">
            {plural(problems.length, 'problem', 'problems')}
          </b>
          {` · ${down} down · ${warn} warn · ${plural(rows, 'row', 'rows')} affected`}
        </>
      ) : (
        <b className="font-semibold">All clear</b>
      )}
    </div>
  );
};

/** One card per problem, worst first; each opens its sheet */
export const NeedsYou = ({
  problems,
  nameOf,
  onOpen
}: {
  problems: Problem[];
  nameOf: (row: string) => string;
  onOpen: (key: string) => void;
}) =>
  problems.length ? (
    <section className="tn-needs grid gap-2">
      <h2 className={`${LABEL} text-[color:var(--block)]`}>NEEDS YOU</h2>
      {problems.map((p) => (
        <button
          key={p.key}
          type="button"
          className={`${CARD} ${SEVERITY_BOX[p.severity]}`}
          data-problem-key={p.key}
          data-severity={p.severity}
          onClick={() => onOpen(p.key)}
        >
          <span className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
            <Chip
              text={p.severity}
              tone={p.severity === 'down' ? 'bad' : 'wait'}
            />
            <b className="text-[15px] font-semibold max-[600px]:text-[13px]">
              {p.title}
            </b>
            <span className="font-[family-name:var(--font-mono)] text-[11px] text-[color:var(--muted)]">
              {nameOf(p.row)}
            </span>
          </span>
          {p.evidence[0] ? (
            <span className="min-w-0 text-[13px] [overflow-wrap:anywhere] text-[color:var(--muted)]">
              {p.evidence[0]}
            </span>
          ) : null}
        </button>
      ))}
    </section>
  ) : null;

const Part = ({ title, children }: { title: string; children: ReactNode }) => (
  <section className="tn-section grid gap-2">
    <h3 className={HEADING}>{title}</h3>
    {children}
  </section>
);

/** What a problem's sheet shows: what, the evidence, the threshold and what can be done */
export const ProblemBody = ({
  problem,
  row
}: {
  problem: Problem;
  row: TenantRow | undefined;
}) => {
  const link = problemLink(problem, row);
  return (
    <>
      <Part title="What">
        <p className="text-[0.95rem] font-semibold">{problem.title}</p>
      </Part>
      <Part title="Evidence">
        <ul className="grid gap-1.5 text-[0.88rem]">
          {problem.evidence.map((line) => (
            <li key={line} className="[overflow-wrap:anywhere]">
              {line}
            </li>
          ))}
        </ul>
      </Part>
      <Part title="Raised when">
        <p className="tn-threshold text-[0.88rem] text-[color:var(--muted)]">
          {problem.threshold}
        </p>
      </Part>
      <Part title="What can be done">
        <ul className="grid list-disc gap-1.5 pl-5 text-[0.88rem]">
          {problem.actions.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        {link ? (
          <a
            className={`${LINK} text-[0.88rem]`}
            href={link.href}
            target="_blank"
            rel="noreferrer"
          >
            {link.text}
          </a>
        ) : null}
      </Part>
    </>
  );
};
