// Web APIs only, so the same file runs in Deno on Supabase and under vitest
import { sameText, sign } from '../_shared/hmac.ts';

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
export const BUILT = ['agent-host-image.yml', 'desk.yml'] as const;

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

  const match = /^\.github\/workflows\/([^/@]+)(?:@.*)?$/.exec(
    text(run['path']) ?? ''
  );
  const workflow = BUILT.find((name) => name === match?.[1]);
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
    table: 'github_events' | 'builds',
    key: string,
    row: GithubEventRow | BuildRow
  ): Promise<Response> => {
    const url = `${(supabaseUrl ?? '').replace(/\/$/, '')}/rest/v1/${table}?on_conflict=${key}`;
    return fetch(url, {
      method: 'POST',
      headers: {
        apikey: serviceKey ?? '',
        Authorization: `Bearer ${serviceKey ?? ''}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal'
      },
      body: JSON.stringify(row)
    });
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
    const row = build ? null : toRow(event, payload, at);
    const write = build
      ? () => upsert('builds', 'workflow', build)
      : row
        ? () => upsert('github_events', 'subject', row)
        : null;
    if (!write) return reply(200, 'Ignored');

    let res: Response;
    try {
      res = await write();
    } catch (error) {
      log({
        event: 'write failed',
        reason: error instanceof Error ? error.message : String(error)
      });
      return reply(500, 'Write failed');
    }
    if (!res.ok) {
      log({ event: 'write failed', status: res.status });
      return reply(500, 'Write failed');
    }
    log(
      build
        ? { event: 'stored', workflow: build.workflow, sha: build.sha }
        : {
            event: 'stored',
            action: row?.action,
            subject: row?.subject
          }
    );
    return reply(200, 'Stored');
  };
};
