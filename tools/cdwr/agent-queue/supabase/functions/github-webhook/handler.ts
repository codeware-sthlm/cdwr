// Web APIs only, so the same file runs in Deno on Supabase and under vitest
import { sameText, sign } from '../_shared/hmac.ts';
import { keyHeaders } from '../_shared/keys.ts';

export { sign };

export type GithubEventRow = {
  subject: string;
  pr: number | null;
  action: string;
  updated_at: string;
};

export type BuildRow = {
  workflow: string;
  sha: string;
  run_created_at: string;
  updated_at: string;
};

export type NoticeLevel = 'urgent' | 'action' | 'info';

export type NoticeRow = {
  id: string;
  at: string;
  host: 'github';
  level: NoticeLevel;
  source: 'github-webhook';
  ticket: null;
  text: string;
};

export type HandlerOptions = {
  secret: string | undefined;
  supabaseUrl: string | undefined;
  serviceKey: string | undefined;
  fetch: (url: string, init: RequestInit) => Promise<Response>;
  now?: () => number;
  log?: (line: Record<string, unknown>) => void;
};

/** The actions stored per event; anything else is answered without a row */
export const STORED: Record<string, readonly string[]> = {
  pull_request: [
    'opened',
    'reopened',
    'closed',
    'synchronize',
    'ready_for_review',
    'review_requested',
    'enqueued',
    'dequeued'
  ],
  pull_request_review: ['submitted'],
  pull_request_review_comment: ['created'],
  check_suite: ['completed']
};

/** The workflows whose successful runs on main are stored in `builds`: each is a new version of what it builds */
export const BUILT = [
  'agent-host-image.yml',
  'desk.yml',
  'desk-image.yml',
  'fly-deployment.yml'
] as const;

/** GitHub sends `sha256=<hex HMAC-SHA256 of the raw body>` in `X-Hub-Signature-256` */
export const verifySignature = async (
  secret: string,
  body: string,
  signature: string | null
): Promise<boolean> => {
  const value = signature?.trim().toLowerCase() ?? '';
  if (!value.startsWith('sha256=')) return false;
  return sameText(await sign(secret, body), value.slice('sha256='.length));
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const text = (value: unknown): string | null =>
  typeof value === 'string' && value !== '' ? value : null;

const number = (value: unknown): number | null =>
  typeof value === 'number' && Number.isInteger(value) && value > 0
    ? value
    : null;

/** The pull request an event names, if any */
const prOf = (
  event: string,
  payload: Record<string, unknown>
): number | null => {
  if (event === 'check_suite') {
    const suite = isRecord(payload['check_suite'])
      ? payload['check_suite']
      : {};
    const prs = Array.isArray(suite['pull_requests'])
      ? suite['pull_requests']
      : [];
    const first: unknown = prs[0];
    if (isRecord(first)) return number(first['number']);
    // The merge queue tests gh-readonly-queue/<base>/pr-<n>-<sha> and lists no pull request
    const queued = /^gh-readonly-queue\/.+\/pr-(\d+)-[0-9a-f]+$/.exec(
      text(suite['head_branch']) ?? ''
    );
    return queued ? number(Number(queued[1])) : null;
  }
  const pr = isRecord(payload['pull_request']) ? payload['pull_request'] : {};
  return number(pr['number']) ?? number(payload['number']);
};

/** The branch an event runs on, for one that names no pull request */
const branchOf = (
  event: string,
  payload: Record<string, unknown>
): string | null => {
  if (event !== 'check_suite' || !isRecord(payload['check_suite'])) return null;
  return text(payload['check_suite']['head_branch']);
};

/** Copilot's login: `Copilot` in webhook payloads, `copilot-pull-request-reviewer` in GraphQL */
const COPILOT = /^(copilot|copilot-pull-request-reviewer(\[bot\])?)$/i;

/**
 * The action's last part: a merge for a merged close, the conclusion of a completed
 * suite (`success`, `failure`, …), `copilot` for Copilot's review, else the verb
 */
const outcomeOf = (
  event: string,
  verb: string,
  payload: Record<string, unknown>
): string => {
  if (event === 'pull_request' && verb === 'closed') {
    const pr = isRecord(payload['pull_request']) ? payload['pull_request'] : {};
    return pr['merged'] === true ? 'merged' : verb;
  }
  if (event === 'check_suite') {
    const suite = isRecord(payload['check_suite'])
      ? payload['check_suite']
      : {};
    return text(suite['conclusion']) ?? verb;
  }
  if (event === 'pull_request_review') {
    const review = isRecord(payload['review']) ? payload['review'] : {};
    const user = isRecord(review['user']) ? review['user'] : {};
    return COPILOT.test(text(user['login']) ?? '') ? 'copilot' : verb;
  }
  return verb;
};

/** The row for a stored event, or null for anything else */
export const toRow = (
  event: string | null,
  payload: Record<string, unknown>,
  at: Date
): GithubEventRow | null => {
  const verb = text(payload['action']);
  if (
    !event ||
    !verb ||
    !Object.hasOwn(STORED, event) ||
    !STORED[event].includes(verb)
  )
    return null;

  const pr = prOf(event, payload);
  const branch = pr === null ? branchOf(event, payload) : null;
  if (pr === null && branch === null) return null;

  return {
    subject: pr !== null ? `pr/${pr}` : `ref/${branch}`,
    pr,
    action: `${event}:${outcomeOf(event, verb, payload)}`,
    updated_at: at.toISOString()
  };
};

// Fixed, so the jobs URL is never taken from the payload
const REPO = 'codeware-sthlm/cdwr';

/** The workflow file a run belongs to, from its `path` (which may carry a ref) */
const workflowOf = (run: Record<string, unknown>): string | null =>
  /^\.github\/workflows\/([^/@]+)(?:@.*)?$/.exec(
    text(run['path']) ?? ''
  )?.[1] ?? null;

/** The build row for a successful workflow run on main of a built workflow, or null for anything else */
export const toBuild = (
  event: string | null,
  payload: Record<string, unknown>,
  at: Date
): BuildRow | null => {
  if (event !== 'workflow_run' || payload['action'] !== 'completed')
    return null;
  const run = isRecord(payload['workflow_run']) ? payload['workflow_run'] : {};
  if (
    run['conclusion'] !== 'success' ||
    run['head_branch'] !== 'main' ||
    (run['event'] !== 'push' && run['event'] !== 'workflow_dispatch')
  )
    return null;

  const workflow = BUILT.find((name) => name === workflowOf(run));
  const sha = text(run['head_sha']);
  // The run's creation, not its start: a re-run of an old run starts anew but keeps it
  const created = text(run['created_at']);
  if (
    !workflow ||
    !sha ||
    !/^[0-9a-f]{40}$/.test(sha) ||
    !created ||
    Number.isNaN(Date.parse(created))
  )
    return null;

  return {
    workflow,
    sha,
    run_created_at: new Date(created).toISOString(),
    updated_at: at.toISOString()
  };
};

const NO_NOTICE = [
  'cancelled',
  'skipped',
  'neutral',
  'action_required',
  'stale'
];

/**
 * The notice for a completed `fly-deployment.yml` run, or null for one that is not
 * worth one. A success only counts when its build job ran, which the caller reads
 * from the run's jobs: `jobsOf` is the run id to read them for (null when not needed)
 * and `buildRan` reads the answer.
 * On main (a push or a dispatch) a failure is `urgent`; anywhere else it is `action`;
 * a success is `info`. `cancelled`, `skipped`, `neutral`, `action_required` and
 * `stale` give nothing.
 */
export const toNotice = (
  event: string | null,
  payload: Record<string, unknown>,
  at: Date
): { row: NoticeRow; jobsOf: number | null } | null => {
  if (event !== 'workflow_run' || payload['action'] !== 'completed')
    return null;
  const run = isRecord(payload['workflow_run']) ? payload['workflow_run'] : {};
  const conclusion = text(run['conclusion']);
  const id = number(run['id']);
  if (
    workflowOf(run) !== 'fly-deployment.yml' ||
    !conclusion ||
    NO_NOTICE.includes(conclusion) ||
    id === null
  )
    return null;

  const success = conclusion === 'success';
  const trigger = text(run['event']);
  // A dispatch on main deploys production, as `toBuild` reads it
  const onMain =
    (trigger === 'push' || trigger === 'workflow_dispatch') &&
    run['head_branch'] === 'main';
  const level: NoticeLevel = success ? 'info' : onMain ? 'urgent' : 'action';
  const label = onMain
    ? 'Production'
    : trigger === 'pull_request'
      ? 'Preview'
      : 'Manual';

  const prs = Array.isArray(run['pull_requests']) ? run['pull_requests'] : [];
  const first: unknown = prs[0];
  const pr = isRecord(first) ? number(first['number']) : null;
  const url =
    text(run['html_url']) ?? `https://github.com/${REPO}/actions/runs/${id}`;
  const updated = text(run['updated_at']);
  const when =
    updated && !Number.isNaN(Date.parse(updated)) ? new Date(updated) : at;

  return {
    row: {
      id: `github:fly-deployment:${id}:${number(run['run_attempt']) ?? 1}`,
      at: when.toISOString(),
      host: 'github',
      level,
      source: 'github-webhook',
      ticket: null,
      text: `${label} deploy ${success ? 'succeeded' : 'failed'}${pr === null ? '' : ` · PR ${pr}`}: ${url}`
    },
    jobsOf: success ? id : null
  };
};

/** Whether the jobs of a run (the `jobs` array of GitHub's answer) include a `build` that succeeded */
export const buildRan = (jobs: unknown): boolean =>
  Array.isArray(jobs) &&
  jobs.some(
    (job: unknown) =>
      isRecord(job) &&
      job['name'] === 'build' &&
      job['conclusion'] === 'success'
  );

const reply = (status: number, message: string): Response =>
  new Response(message, {
    status,
    headers: { 'content-type': 'text/plain; charset=utf-8' }
  });

export const createHandler = ({
  secret,
  supabaseUrl,
  serviceKey,
  fetch,
  now = () => Date.now(),
  log = (line) => console.log(JSON.stringify(line))
}: HandlerOptions) => {
  const upsert = async (
    table: 'github_events' | 'builds' | 'notices',
    key: string,
    row: GithubEventRow | BuildRow | NoticeRow,
    resolution: 'merge' | 'ignore' = 'merge'
  ): Promise<Response> => {
    const url = `${(supabaseUrl ?? '').replace(/\/$/, '')}/rest/v1/${table}?on_conflict=${key}`;
    return fetch(url, {
      method: 'POST',
      headers: {
        ...keyHeaders(serviceKey ?? ''),
        'Content-Type': 'application/json',
        Prefer: `resolution=${resolution}-duplicates,return=minimal`
      },
      body: JSON.stringify(row)
    });
  };

  /** Whether the run's build job succeeded, or null when GitHub could not be read */
  const readBuild = async (id: string): Promise<boolean | null> => {
    try {
      const res = await fetch(
        `https://api.github.com/repos/${REPO}/actions/runs/${id}/jobs?per_page=100`,
        {
          method: 'GET',
          headers: {
            Accept: 'application/vnd.github+json',
            'User-Agent': 'cdwr-github-webhook'
          }
        }
      );
      if (!res.ok) {
        log({ event: 'notice skipped', reason: 'jobs', status: res.status });
        return null;
      }
      const body: unknown = await res.json();
      return buildRan(isRecord(body) ? body['jobs'] : null);
    } catch (error) {
      log({
        event: 'notice skipped',
        reason: error instanceof Error ? error.message : String(error)
      });
      return null;
    }
  };

  return async (request: Request): Promise<Response> => {
    if (request.method !== 'POST') return reply(405, 'POST only');
    if (!secret || !supabaseUrl || !serviceKey) {
      log({ event: 'not configured' });
      return reply(500, 'Not configured');
    }

    const body = await request.text();
    if (
      !(await verifySignature(
        secret,
        body,
        request.headers.get('x-hub-signature-256')
      ))
    ) {
      log({ event: 'refused', reason: 'signature' });
      return reply(401, 'Bad signature');
    }

    const event = request.headers.get('x-github-event');
    if (event === 'ping') return reply(200, 'Pong');

    let payload: unknown;
    try {
      payload = JSON.parse(body);
    } catch {
      // A webhook left on GitHub's default form encoding lands here on every delivery
      log({ event: 'refused', reason: 'not json' });
      return reply(400, 'Not JSON');
    }
    if (!isRecord(payload)) return reply(400, 'Not an object');

    const at = new Date(now());
    const build = toBuild(event, payload, at);
    const notice = toNotice(event, payload, at);
    const row = toRow(event, payload, at);

    // Each write is idempotent, so a failed one answers 500: the delivery shows as failed
    // in the webhook settings and can be redelivered by hand
    const writes: {
      write: () => Promise<Response>;
      stored: Record<string, unknown>;
    }[] = [];
    if (build)
      writes.push({
        write: () => upsert('builds', 'workflow', build),
        stored: { event: 'stored', workflow: build.workflow, sha: build.sha }
      });
    if (row)
      writes.push({
        write: () => upsert('github_events', 'subject', row),
        stored: { event: 'stored', action: row.action, subject: row.subject }
      });
    if (notice) {
      const built =
        notice.jobsOf === null ? true : await readBuild(String(notice.jobsOf));
      if (built)
        writes.push({
          write: () => upsert('notices', 'id', notice.row, 'ignore'),
          stored: {
            event: 'stored',
            notice: notice.row.id,
            level: notice.row.level
          }
        });
    }
    if (writes.length === 0) return reply(200, 'Ignored');

    const results = await Promise.allSettled(
      writes.map(({ write }) => write())
    );
    let failed = false;
    results.forEach((result, i) => {
      if (result.status === 'rejected') {
        const error: unknown = result.reason;
        log({
          event: 'write failed',
          reason: error instanceof Error ? error.message : String(error)
        });
        failed = true;
      } else if (result.value.ok) {
        log(writes[i].stored);
      } else {
        log({ event: 'write failed', status: result.value.status });
        failed = true;
      }
    });
    return failed ? reply(500, 'Write failed') : reply(200, 'Stored');
  };
};
