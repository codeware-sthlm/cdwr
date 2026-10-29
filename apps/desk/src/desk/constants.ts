import type { OpenStatusType } from '../linear';

export const STATES: readonly OpenStatusType[] = [
  'triage',
  'backlog',
  'unstarted',
  'started'
];

/** The Agent labels a ticket can carry; the state is the part after `agent:` */
export const AGENT: readonly string[] = [
  'agent:needs-input',
  'agent:working',
  'agent:ready',
  'agent:review'
];

/** Labels of tickets that belong to other repos and stay off the page */
export const OTHER_REPOS: readonly string[] = ['nx-plugins', 'enjinex'];

export const LINEAR_ISSUE = 'https://linear.app/codeware/issue/';

export const ROLES = ['planning', 'orchestrating', 'implementing'] as const;
export type Role = (typeof ROLES)[number];

export const STALE_HOURS = 2; // a scheduler silent this long is a problem
export const STUCK_MIN = 5; // a session polling this long while the queue has work for it missed the wake
export const INSTALL_MINUTES = 10; // what cdwr agent install writes (RUN_INTERVAL_SECONDS 600), assumed until the Job line says
export const LIMIT = 5; // the default limit of open agent PRs, used until the queue view says
export const SHIP_DAYS = 30; // agent tickets closed per day over this many days, the one trend on the page

/** Status first (In Progress, Todo, Backlog, Triage), then priority, then oldest */
export const STATUS_RANK: ReadonlyMap<string, number> = new Map([
  ['started', 0],
  ['unstarted', 1],
  ['backlog', 2],
  ['triage', 3]
]);

const WAIT: ReadonlyMap<string, string> = new Map([
  ['ci', 'CI'],
  ['copilot', 'Copilot review']
]);

/** What a parked ticket waits on, by name; undefined for a wait the page does not list */
export const waitName = (wait: string | undefined): string | undefined =>
  wait === undefined ? undefined : WAIT.get(wait);

/** Error codes that mean what is shown can no longer be trusted, so the source's data is dropped */
export const RETRACT: readonly string[] = [
  'unauthorized',
  'bad_response',
  'needs_reauth',
  'server_not_connected',
  'selection_required',
  'not_in_manifest',
  'consent_required',
  'blocked_by_policy',
  'approval_required'
];
