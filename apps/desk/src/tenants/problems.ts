import { shortAge } from '../desk/format';

import { SHARED_KEY, type TenantRow } from './model';
import {
  BACKUP_STALE_HOURS,
  DB_SESSIONS_MAX,
  DB_SESSIONS_WARN,
  certPending
} from './thresholds';

// What is wrong with a tenant row, as the problem cards of the tenants view say it. Pure:
// each kind is one predicate with its threshold written in the problem, so the card can say
// why it was raised. The row's status derives from the same predicates.

export type ProblemKind =
  'backup' | 'behind' | 'cert' | 'deploy' | 'down' | 'errors' | 'pooler';

export type ProblemSeverity = 'down' | 'warn';

export type Problem = {
  /** `<row>:<kind>`, with `:<app or hostname>` for the kinds that come one per app or domain */
  key: string;
  /** The row's key: a tenant's slug, or `_shared` */
  row: string;
  kind: ProblemKind;
  severity: ProblemSeverity;
  title: string;
  evidence: string[];
  /** The rule that raised it, in words */
  threshold: string;
  /** What can be done, one line each; the card has no buttons yet */
  actions: string[];
};

/** Issues in the last 24 hours from which an error spike counts */
export const ERRORS_MIN = 10;

/** How many times the daily average of the six days before the 24 hours an error spike must reach */
export const ERRORS_FACTOR = 3;

/** The health check gives up after this many seconds */
const HEALTH_TIMEOUT_S = 10;

/** Where an issue is listed in Sentry */
export const sentryIssueUrl = (org: string, shortId: string): string =>
  `https://${org}.sentry.io/issues/?query=${encodeURIComponent(shortId)}`;

const short = (sha: string): string => sha.slice(0, 7);

const down = (row: TenantRow): Problem[] =>
  row.apps.flatMap((a): Problem[] => {
    const base = { row: row.key, kind: 'down', severity: 'down' } as const;
    const key = `${row.key}:down:${a.app}`;
    // `ok` is any 2xx, so the status itself decides
    if (
      a.health &&
      (!a.health.ok || (a.health.status !== null && a.health.status !== 200))
    )
      return [
        {
          ...base,
          key,
          title: `${a.app} is down`,
          evidence: [
            a.health.status === null
              ? `No answer within ${HEALTH_TIMEOUT_S} s`
              : `Health check answered ${a.health.status}`
          ],
          threshold: `The app's health check answers anything but 200, or does not answer within ${HEALTH_TIMEOUT_S} s. A suspended or stopped machine is not down: apps scale to zero.`,
          actions: [
            "Restart the app's machines (fly machine restart)",
            "Read the app's logs (fly logs)"
          ]
        }
      ];
    if (a.machines !== null && a.machines.length === 0)
      return [
        {
          ...base,
          key,
          title: `${a.app} has no machine`,
          evidence: ['The machines were read and the list is empty'],
          threshold:
            'The app has no machine at all. A suspended or stopped machine is not down: apps scale to zero.',
          actions: [
            'Redeploy the app',
            'Check that the app was not destroyed on purpose'
          ]
        }
      ];
    return [];
  });

const behind = (row: TenantRow, deploySha: string | null): Problem[] =>
  row.apps
    .filter((a) => a.behind === true)
    .map((a) => {
      const shas = [
        ...new Set((a.machines ?? []).flatMap((m) => (m.sha ? [m.sha] : [])))
      ].map(short);
      const versions = [
        ...new Set(
          (a.machines ?? []).flatMap((m) => (m.version ? [m.version] : []))
        )
      ];
      return {
        key: `${row.key}:behind:${a.app}`,
        row: row.key,
        kind: 'behind',
        severity: 'warn',
        title: `${a.app} is behind`,
        evidence: [
          versions.length && a.latest
            ? `Machines run ${versions.join(', ')}, the newest release is ${a.latest}`
            : `Machines on ${shas.length ? shas.join(', ') : 'no known commit'}${deploySha ? `, the newest deploy of main is ${short(deploySha)}` : ''}`
        ],
        threshold:
          "A machine's commit does not hold the newest release tag of the app's project on main.",
        actions: [
          'Wait for the next deploy run',
          'Open the deploy run and check its job for this app'
        ]
      };
    });

const cert = (row: TenantRow): Problem[] =>
  row.domains
    .filter((d) => certPending(d.certificate))
    .map((d) => ({
      key: `${row.key}:cert:${d.hostname}`,
      row: row.key,
      kind: 'cert',
      severity: 'warn',
      title: `Certificate of ${d.hostname} is not ready`,
      evidence: [`Fly reports the certificate as ${d.certificate}`],
      threshold:
        'A domain whose certificate is anything but ready. An unread certificate (unknown) does not count.',
      actions: [
        'Check the domain’s DNS records (fly certs check)',
        'Wait: a new certificate takes a few minutes'
      ]
    }));

const pooler = (row: TenantRow): Problem[] =>
  row.key === SHARED_KEY &&
  row.db !== null &&
  row.db.pooler !== null &&
  row.db.pooler >= DB_SESSIONS_WARN
    ? [
        {
          key: `${row.key}:pooler`,
          row: row.key,
          kind: 'pooler',
          severity: 'warn',
          title: 'The database pooler is nearly full',
          evidence: [
            `${row.db.pooler} of ${DB_SESSIONS_MAX} pooler sessions in use`,
            ...Object.entries(row.db.byApplication).map(
              ([name, n]) => `${name}: ${n}`
            )
          ],
          threshold: `${DB_SESSIONS_WARN} or more of the ${DB_SESSIONS_MAX} pooler (Supavisor) sessions in use, three below the pool size.`,
          actions: [
            'See which application holds the sessions',
            'Restart the app that leaks sessions (fly machine restart)'
          ]
        }
      ]
    : [];

const errors = (row: TenantRow): Problem[] => {
  const s = row.sentry;
  if (!s) return [];
  const average = Math.max(0, (s.count7d - s.count24h) / 6);
  if (s.count24h < ERRORS_MIN || s.count24h < ERRORS_FACTOR * average)
    return [];
  const rounded = Math.round(average * 10) / 10;
  return [
    {
      key: `${row.key}:errors`,
      row: row.key,
      kind: 'errors',
      severity: 'warn',
      title: `Error spike: ${s.count24h} in 24 hours`,
      evidence: [
        `${s.count24h} events in 24 hours against a daily average of ${rounded} over the six days before`,
        ...(s.top
          ? [
              `${s.top.shortId} · ${s.top.level} · ${s.top.count}× · ${s.top.title}`
            ]
          : [])
      ],
      threshold: `At least ${ERRORS_MIN} events in 24 hours and at least ${ERRORS_FACTOR} times the daily average of the six days before; with no average, ${ERRORS_MIN} is enough.`,
      actions: ['Open the issue in Sentry', 'Check what deployed in that time']
    }
  ];
};

const deploy = (row: TenantRow): Problem[] =>
  row.key === SHARED_KEY && row.deploy?.conclusion === 'failure'
    ? [
        {
          key: `${row.key}:deploy`,
          row: row.key,
          kind: 'deploy',
          severity: 'warn',
          title: "The newest deploy of main's deploy job failed",
          evidence: [
            `Run ${row.deploy.runId} on ${short(row.deploy.sha)}${row.deploy.at ? `, ${row.deploy.at}` : ''}`
          ],
          threshold:
            "The deploy job of the newest deploy run of main concluded failure. It clears when a newer run's deploy job does not fail; a skipped job is not a failure.",
          actions: ['Open the run', 'Fix the failing job and rerun it']
        }
      ]
    : [];

// A failed last run with a fresh newest dump is not a problem: the sheet shows it, nothing more
const backup = (row: TenantRow, now: number): Problem[] => {
  const b = row.backup;
  if (row.key !== SHARED_KEY || b === null) return [];
  const at = b.newestAt === null ? NaN : Date.parse(b.newestAt);
  const ageH = (now - at) / 36e5;
  // A time that does not parse counts as no dump
  if (Number.isFinite(ageH) && ageH <= BACKUP_STALE_HOURS) return [];
  return [
    {
      key: `${row.key}:backup`,
      row: row.key,
      kind: 'backup',
      severity: 'warn',
      title: Number.isFinite(ageH)
        ? `The newest database backup is ${shortAge(ageH * 60)} old`
        : 'No database backup on the NUC yet',
      evidence: [
        ...(b.newest
          ? [`Newest dump ${b.newest}${b.newestAt ? `, ${b.newestAt}` : ''}`]
          : []),
        ...(b.lastRun && !b.lastRun.ok
          ? [
              `Last run ${b.lastRun.at} failed: ${b.lastRun.error ?? 'no error recorded'}`
            ]
          : [])
      ],
      threshold: `The newest dump is more than ${BACKUP_STALE_HOURS} hours old; the NUC dumps the cms database each night after 02:00. A backup that was never configured is not a problem.`,
      actions: [
        'Read the scheduler log on the NUC (backup-status.json in the queue home)',
        'Run `cdwr agent backup` on the NUC by hand'
      ]
    }
  ];
};

const KIND_ORDER = [
  'backup',
  'behind',
  'cert',
  'deploy',
  'down',
  'errors',
  'pooler'
];

/** The problems of one row; `deploySha` is the commit the newest deploy run of main carries, for the behind evidence; `now` is ms */
export const problemsOf = (
  row: TenantRow,
  deploySha: string | null = null,
  now: number = Date.now()
): Problem[] => [
  ...down(row),
  ...behind(row, deploySha),
  ...cert(row),
  ...pooler(row),
  ...errors(row),
  ...deploy(row),
  ...backup(row, now)
];

/** Worst first (down before warn), then by row with `_shared` first, then by kind and key */
export const allProblems = (
  entries: readonly { row: TenantRow }[],
  now: number = Date.now()
): Problem[] => {
  const deploySha =
    entries.find((e) => e.row.key === SHARED_KEY)?.row.deploy?.sha ?? null;
  return entries
    .flatMap((e) => problemsOf(e.row, deploySha, now))
    .sort(
      (a, b) =>
        Number(b.severity === 'down') - Number(a.severity === 'down') ||
        Number(b.row === SHARED_KEY) - Number(a.row === SHARED_KEY) ||
        a.row.localeCompare(b.row) ||
        KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) ||
        a.key.localeCompare(b.key)
    );
};
