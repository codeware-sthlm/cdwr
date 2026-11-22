import {
  buildRan,
  createHandler,
  sign,
  toBuild,
  toNotice,
  toRow,
  verifySignature
} from './handler';

const SECRET = 'whsec-test';
const NOW = Date.parse('2026-10-29T16:00:00Z');
const AT = new Date(NOW);

const prEvent = (extra: Record<string, unknown> = {}) => ({
  action: 'opened',
  number: 712,
  pull_request: { number: 712, title: 'Secret title', merged: false },
  ...extra
});

const suiteEvent = (suite: Record<string, unknown>) => ({
  action: 'completed',
  check_suite: { conclusion: 'success', ...suite }
});

const SHA = '0123456789abcdef0123456789abcdef01234567';

const runEvent = (run: Record<string, unknown> = {}) => ({
  action: 'completed',
  workflow_run: {
    conclusion: 'success',
    head_branch: 'main',
    head_sha: SHA,
    event: 'push',
    path: '.github/workflows/agent-host-image.yml',
    created_at: '2026-10-29T15:50:00Z',
    // A re-run starts later than the run was created; the row keeps the creation
    run_started_at: '2026-10-29T15:58:00Z',
    display_title: 'Secret title',
    ...run
  }
});

const deployEvent = (run: Record<string, unknown> = {}) =>
  runEvent({
    id: 9001,
    run_attempt: 1,
    path: '.github/workflows/fly-deployment.yml',
    html_url: 'https://github.com/codeware-sthlm/cdwr/actions/runs/9001',
    updated_at: '2026-10-29T15:59:00Z',
    pull_requests: [],
    ...run
  });

const setup = (
  options: {
    secret?: string;
    status?: number;
    fail?: boolean;
    // The answer to the jobs read; a number is a failing status
    jobs?: Array<{ name: string; conclusion: string }> | number;
    failOn?: string;
  } = {}
) => {
  const fetch = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(
    async (url) => {
      if (url.startsWith('https://api.github.com/')) {
        if (typeof options.jobs === 'number')
          return new Response(null, { status: options.jobs });
        return Response.json({
          jobs: options.jobs ?? [{ name: 'build', conclusion: 'success' }]
        });
      }
      if (options.fail) throw new Error('offline');
      if (options.failOn && url.includes(options.failOn))
        return new Response(null, { status: 500 });
      return new Response(null, { status: options.status ?? 201 });
    }
  );
  const log = vi.fn();
  const handle = createHandler({
    secret: 'secret' in options ? options.secret : SECRET,
    supabaseUrl: 'https://x.supabase.co/',
    serviceKey: 'service',
    fetch,
    now: () => NOW,
    log
  });
  return { fetch, log, handle };
};

const post = async (
  payload: unknown,
  {
    event = 'pull_request',
    signature,
    method = 'POST'
  }: { event?: string; signature?: string | null; method?: string } = {}
) => {
  const body = typeof payload === 'string' ? payload : JSON.stringify(payload);
  const headers = new Headers({ 'X-GitHub-Event': event });
  const sig =
    signature === undefined ? `sha256=${await sign(SECRET, body)}` : signature;
  if (sig !== null) headers.set('X-Hub-Signature-256', sig);
  return new Request('https://x.supabase.co/functions/v1/github-webhook', {
    method,
    headers,
    body: method === 'POST' ? body : undefined
  });
};

describe('verifySignature', () => {
  it('accepts sha256= and the HMAC of the body, in either case', async () => {
    const sig = `sha256=${await sign(SECRET, 'body')}`;
    expect(await verifySignature(SECRET, 'body', sig)).toBe(true);
    expect(await verifySignature(SECRET, 'body', sig.toUpperCase())).toBe(true);
  });

  it.each([
    ['no header', null],
    ['an empty header', ''],
    ['a bare HMAC without sha256=', 'bare'],
    ['another secret', 'other']
  ])('refuses %s', async (_name, value) => {
    const signature =
      value === 'other'
        ? `sha256=${await sign('other', 'body')}`
        : value === 'bare'
          ? await sign(SECRET, 'body')
          : value;
    expect(await verifySignature(SECRET, 'body', signature)).toBe(false);
  });

  it('refuses a body changed after signing', async () => {
    const sig = `sha256=${await sign(SECRET, 'body')}`;
    expect(await verifySignature(SECRET, 'body ', sig)).toBe(false);
  });
});

describe('toRow', () => {
  it.each([
    'opened',
    'reopened',
    'closed',
    'synchronize',
    'ready_for_review',
    'review_requested',
    'enqueued',
    'dequeued'
  ])('maps pull_request %s to its PR', (action) => {
    expect(toRow('pull_request', prEvent({ action }), AT)).toEqual({
      subject: 'pr/712',
      pr: 712,
      action: `pull_request:${action}`,
      updated_at: AT.toISOString()
    });
  });

  it('tells a merge from a close', () => {
    expect(
      toRow(
        'pull_request',
        prEvent({
          action: 'closed',
          pull_request: { number: 712, merged: true }
        }),
        AT
      )?.action
    ).toBe('pull_request:merged');
  });

  it.each([
    ['pull_request_review', 'submitted'],
    ['pull_request_review_comment', 'created']
  ])('maps %s %s to its PR', (event, action) => {
    expect(
      toRow(
        event,
        { action, pull_request: { number: 712 }, review: { body: 'words' } },
        AT
      )
    ).toEqual({
      subject: 'pr/712',
      pr: 712,
      action: `${event}:${action}`,
      updated_at: AT.toISOString()
    });
  });

  it.each(['Copilot', 'copilot-pull-request-reviewer[bot]'])(
    'tells a review by %s from any other',
    (login) => {
      expect(
        toRow(
          'pull_request_review',
          {
            action: 'submitted',
            pull_request: { number: 712 },
            review: { user: { login } }
          },
          AT
        )?.action
      ).toBe('pull_request_review:copilot');
      expect(
        toRow(
          'pull_request_review',
          {
            action: 'submitted',
            pull_request: { number: 712 },
            review: { user: { login: 'hakan' } }
          },
          AT
        )?.action
      ).toBe('pull_request_review:submitted');
    }
  );

  it.each(['success', 'failure', 'cancelled'])(
    'names a completed suite by its conclusion (%s)',
    (conclusion) => {
      expect(
        toRow(
          'check_suite',
          suiteEvent({ conclusion, pull_requests: [{ number: 712 }] }),
          AT
        )?.action
      ).toBe(`check_suite:${conclusion}`);
    }
  );

  it('keeps completed for a suite without a conclusion', () => {
    expect(
      toRow(
        'check_suite',
        suiteEvent({ conclusion: null, pull_requests: [{ number: 712 }] }),
        AT
      )?.action
    ).toBe('check_suite:completed');
  });

  it('maps a completed check suite to its first PR', () => {
    expect(
      toRow(
        'check_suite',
        suiteEvent({
          head_branch: 'cod-655-x',
          pull_requests: [{ number: 712 }, { number: 713 }]
        }),
        AT
      )
    ).toMatchObject({
      subject: 'pr/712',
      pr: 712,
      action: 'check_suite:success'
    });
  });

  it('maps a check suite without a PR to its branch', () => {
    expect(
      toRow(
        'check_suite',
        suiteEvent({ head_branch: 'main', pull_requests: [] }),
        AT
      )
    ).toMatchObject({ subject: 'ref/main', pr: null });
  });

  it('maps a merge queue check suite to the PR it tests', () => {
    expect(
      toRow(
        'check_suite',
        suiteEvent({
          head_branch: 'gh-readonly-queue/main/pr-712-0a1b2c3d4e5f',
          pull_requests: []
        }),
        AT
      )
    ).toMatchObject({ subject: 'pr/712', pr: 712 });
  });

  it.each(['constructor', 'toString', '__proto__'])(
    'ignores an event named like an object property (%s)',
    (event) => {
      expect(toRow(event, { action: 'includes' }, AT)).toBeNull();
    }
  );

  it.each([
    [
      'an event it does not store',
      'issues',
      { action: 'opened', issue: { number: 1 } }
    ],
    [
      'an action it does not store',
      'pull_request',
      prEvent({ action: 'labeled' })
    ],
    [
      'a review edit',
      'pull_request_review',
      { action: 'edited', pull_request: { number: 1 } }
    ],
    [
      'a requested check suite',
      'check_suite',
      { action: 'requested', check_suite: { head_branch: 'main' } }
    ],
    ['no event header', null, prEvent()],
    ['no action', 'pull_request', { pull_request: { number: 1 } }],
    [
      'a PR without a number',
      'pull_request',
      { action: 'opened', pull_request: {} }
    ],
    [
      'a check suite without PR or branch',
      'check_suite',
      suiteEvent({ pull_requests: [] })
    ]
  ])('ignores %s', (_name, event, payload) => {
    expect(toRow(event, payload, AT)).toBeNull();
  });
});

describe('toBuild', () => {
  it.each([
    'agent-host-image.yml',
    'desk.yml',
    'desk-image.yml',
    'fly-deployment.yml'
  ])(
    'maps a successful push run of %s on main to its workflow and commit',
    (workflow) => {
      expect(
        toBuild(
          'workflow_run',
          runEvent({ path: `.github/workflows/${workflow}` }),
          AT
        )
      ).toEqual({
        workflow,
        sha: SHA,
        run_created_at: '2026-10-29T15:50:00.000Z',
        updated_at: AT.toISOString()
      });
    }
  );

  it('maps a dispatched run, and a path carrying a ref', () => {
    expect(
      toBuild(
        'workflow_run',
        runEvent({
          event: 'workflow_dispatch',
          path: '.github/workflows/desk.yml@refs/heads/main'
        }),
        AT
      )
    ).toMatchObject({ workflow: 'desk.yml', sha: SHA });
  });

  it.each([
    ['another event', 'check_suite', runEvent()],
    ['a requested run', 'workflow_run', { ...runEvent(), action: 'requested' }],
    ['a failed run', 'workflow_run', runEvent({ conclusion: 'failure' })],
    ['a cancelled run', 'workflow_run', runEvent({ conclusion: 'cancelled' })],
    ['another branch', 'workflow_run', runEvent({ head_branch: 'cod-1-x' })],
    ['a pull request run', 'workflow_run', runEvent({ event: 'pull_request' })],
    [
      'a workflow it does not track',
      'workflow_run',
      runEvent({ path: '.github/workflows/ci.yml' })
    ],
    [
      'a tracked name outside the workflows folder',
      'workflow_run',
      runEvent({ path: 'apps/desk.yml' })
    ],
    ['a malformed sha', 'workflow_run', runEvent({ head_sha: 'abc' })],
    ['a missing creation time', 'workflow_run', runEvent({ created_at: null })],
    [
      'an unparsable creation time',
      'workflow_run',
      runEvent({ created_at: 'soon' })
    ],
    ['no run', 'workflow_run', { action: 'completed' }]
  ])('ignores %s', (_name, event, payload) => {
    expect(toBuild(event, payload, AT)).toBeNull();
  });
});

describe('toNotice', () => {
  const notice = (run: Record<string, unknown>, event = 'workflow_run') =>
    toNotice(event, deployEvent(run), AT);

  it('makes a failed push on main urgent', () => {
    expect(notice({ conclusion: 'failure' })).toEqual({
      row: {
        id: 'github:fly-deployment:9001:1',
        at: '2026-10-29T15:59:00.000Z',
        host: 'github',
        level: 'urgent',
        source: 'github-webhook',
        ticket: null,
        text: 'Production deploy failed: https://github.com/codeware-sthlm/cdwr/actions/runs/9001'
      },
      jobsOf: null
    });
  });

  it('makes a failed pull request run an action with its PR number', () => {
    const result = notice({
      conclusion: 'timed_out',
      event: 'pull_request',
      head_branch: 'feat/x',
      pull_requests: [{ number: 812 }]
    });
    expect(result?.row.level).toBe('action');
    expect(result?.row.text).toBe(
      'Preview deploy failed · PR 812: https://github.com/codeware-sthlm/cdwr/actions/runs/9001'
    );
  });

  it('makes a failed dispatch on main urgent, as a production deploy', () => {
    const result = notice({
      conclusion: 'failure',
      event: 'workflow_dispatch'
    });
    expect(result?.row.level).toBe('urgent');
    expect(result?.row.text).toMatch(/^Production deploy failed: /);
  });

  it('makes a successful dispatch on main info, as production', () => {
    const result = notice({
      conclusion: 'success',
      event: 'workflow_dispatch'
    });
    expect(result?.row.level).toBe('info');
    expect(result?.row.text).toMatch(/^Production deploy succeeded: /);
  });

  it('makes a failed dispatch on another branch an action', () => {
    const result = notice({
      conclusion: 'failure',
      event: 'workflow_dispatch',
      head_branch: 'feat/x'
    });
    expect(result?.row.level).toBe('action');
    expect(result?.row.text).toMatch(/^Manual deploy failed: /);
  });

  it('makes a success info and asks for the jobs', () => {
    const result = notice({
      conclusion: 'success',
      event: 'pull_request',
      pull_requests: [{ number: 812 }]
    });
    expect(result?.jobsOf).toBe(9001);
    expect(result?.row.level).toBe('info');
    expect(result?.row.text).toMatch(/^Preview deploy succeeded · PR 812: /);
  });

  it('gives a re-run its own id', () => {
    expect(notice({ conclusion: 'failure', run_attempt: 2 })?.row.id).toBe(
      'github:fly-deployment:9001:2'
    );
  });

  it.each(['cancelled', 'skipped', 'neutral', 'action_required', 'stale'])(
    'ignores %s',
    (conclusion) => {
      expect(notice({ conclusion })).toBeNull();
    }
  );

  it('ignores other workflows, other events and runs not completed', () => {
    expect(
      notice({ conclusion: 'failure', path: '.github/workflows/desk.yml' })
    ).toBeNull();
    expect(notice({ conclusion: 'failure' }, 'pull_request')).toBeNull();
    expect(
      toNotice(
        'workflow_run',
        { ...deployEvent({ conclusion: 'failure' }), action: 'requested' },
        AT
      )
    ).toBeNull();
    expect(notice({ conclusion: null })).toBeNull();
  });
});

describe('buildRan', () => {
  it('needs a build job that succeeded', () => {
    expect(buildRan([{ name: 'build', conclusion: 'success' }])).toBe(true);
    expect(buildRan([{ name: 'build', conclusion: 'skipped' }])).toBe(false);
    expect(buildRan([{ name: 'deploy', conclusion: 'success' }])).toBe(false);
    expect(buildRan(undefined)).toBe(false);
  });
});

describe('createHandler', () => {
  it('upserts a build on workflow, and nothing else of the run', async () => {
    const { handle, fetch } = setup();
    const res = await handle(await post(runEvent(), { event: 'workflow_run' }));

    expect(res.status).toBe(200);
    expect(await res.text()).toBe('Stored');
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe(
      'https://x.supabase.co/rest/v1/builds?on_conflict=workflow'
    );
    expect(String(init.body)).not.toContain('Secret title');
    expect(JSON.parse(String(init.body))).toEqual({
      workflow: 'agent-host-image.yml',
      sha: SHA,
      run_created_at: '2026-10-29T15:50:00.000Z',
      updated_at: AT.toISOString()
    });
  });

  it('answers 200 without writing for a run it does not store', async () => {
    const { handle, fetch } = setup();
    const res = await handle(
      await post(runEvent({ conclusion: 'failure' }), {
        event: 'workflow_run'
      })
    );
    expect(await res.text()).toBe('Ignored');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('upserts the row on subject with the service key, and nothing of the payload', async () => {
    const { handle, fetch } = setup();
    const res = await handle(await post(prEvent()));

    expect(res.status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe(
      'https://x.supabase.co/rest/v1/github_events?on_conflict=subject'
    );
    expect(init.headers).toMatchObject({
      apikey: 'service',
      Prefer: 'resolution=merge-duplicates,return=minimal'
    });
    expect(init.headers).not.toHaveProperty('Authorization');
    expect(String(init.body)).not.toContain('Secret title');
    expect(JSON.parse(String(init.body))).toEqual({
      subject: 'pr/712',
      pr: 712,
      action: 'pull_request:opened',
      updated_at: AT.toISOString()
    });
  });

  it.each([
    ['a missing signature', null],
    ['a wrong signature', 'sha256=deadbeef']
  ])('answers 401 to %s and writes nothing', async (_name, signature) => {
    const { handle, fetch } = setup();
    const res = await handle(await post(prEvent(), { signature }));
    expect(res.status).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('answers a signed ping without writing', async () => {
    const { handle, fetch } = setup();
    const res = await handle(
      await post({ zen: 'Keep it simple' }, { event: 'ping' })
    );
    expect(res.status).toBe(200);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('refuses an unsigned ping', async () => {
    const { handle } = setup();
    const res = await handle(
      await post({}, { event: 'ping', signature: null })
    );
    expect(res.status).toBe(401);
  });

  it('answers 400 to a signed body that is not JSON', async () => {
    const { handle } = setup();
    expect((await handle(await post('not json'))).status).toBe(400);
  });

  it('answers 200 without writing for an event it does not store', async () => {
    const { handle, fetch } = setup();
    const res = await handle(
      await post(
        { action: 'opened', issue: { number: 1 } },
        { event: 'issues' }
      )
    );
    expect(res.status).toBe(200);
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    ['answers an error', { status: 500 }],
    ['cannot be reached', { fail: true }]
  ])(
    'answers 500 when the database %s, so the delivery shows as failed',
    async (_name, options) => {
      const { handle } = setup(options);
      expect((await handle(await post(prEvent()))).status).toBe(500);
    }
  );

  it('refuses everything without a secret', async () => {
    const { handle, fetch } = setup({ secret: undefined });
    expect((await handle(await post(prEvent()))).status).toBe(500);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('answers 405 to anything but POST', async () => {
    const { handle } = setup();
    expect((await handle(await post('', { method: 'GET' }))).status).toBe(405);
  });

  describe('deploy notices', () => {
    const deploy = async (
      run: Record<string, unknown>,
      options: Parameters<typeof setup>[0] = {}
    ) => {
      const harness = setup(options);
      const res = await harness.handle(
        await post(deployEvent(run), { event: 'workflow_run' })
      );
      const writes = harness.fetch.mock.calls.filter(([url]) =>
        url.includes('/rest/v1/')
      );
      return { ...harness, res, writes };
    };

    it('writes a failure to notices without reading the jobs', async () => {
      const { res, writes, fetch } = await deploy({ conclusion: 'failure' });
      expect(res.status).toBe(200);
      expect(fetch).toHaveBeenCalledTimes(1);
      const [url, init] = writes[0];
      expect(url).toBe('https://x.supabase.co/rest/v1/notices?on_conflict=id');
      expect(init.method).toBe('POST');
      expect(new Headers(init.headers).get('Prefer')).toBe(
        'resolution=ignore-duplicates,return=minimal'
      );
      expect(JSON.parse(String(init.body))).toMatchObject({
        id: 'github:fly-deployment:9001:1',
        host: 'github',
        source: 'github-webhook',
        level: 'urgent'
      });
      expect(String(init.body)).not.toContain('Secret title');
    });

    it('sends the same id again on a redelivery', async () => {
      const first = await deploy({ conclusion: 'failure' });
      const second = await deploy({ conclusion: 'failure' });
      expect(String(second.writes[0][1].body)).toBe(
        String(first.writes[0][1].body)
      );
    });

    it('writes a success whose build ran, after the jobs read, with the build row', async () => {
      const { res, fetch, writes } = await deploy({ conclusion: 'success' });
      expect(res.status).toBe(200);
      expect(fetch.mock.calls[0][0]).toBe(
        'https://api.github.com/repos/codeware-sthlm/cdwr/actions/runs/9001/jobs?per_page=100'
      );
      expect(writes.map(([url]) => url)).toEqual([
        'https://x.supabase.co/rest/v1/builds?on_conflict=workflow',
        'https://x.supabase.co/rest/v1/notices?on_conflict=id'
      ]);
      expect(JSON.parse(String(writes[1][1].body)).level).toBe('info');
    });

    it('records no notice for a success whose build skipped', async () => {
      const { writes } = await deploy(
        { conclusion: 'success' },
        { jobs: [{ name: 'build', conclusion: 'skipped' }] }
      );
      expect(writes.map(([url]) => url)).toEqual([
        'https://x.supabase.co/rest/v1/builds?on_conflict=workflow'
      ]);
    });

    it('records no notice and logs a skip when the jobs read fails', async () => {
      const { res, writes, log } = await deploy(
        { conclusion: 'success', head_branch: 'feat/x', event: 'pull_request' },
        { jobs: 403 }
      );
      expect(res.status).toBe(200);
      expect(await res.text()).toBe('Ignored');
      expect(writes).toHaveLength(0);
      expect(log).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'notice skipped' })
      );
    });

    it('answers 500 when the notice write fails', async () => {
      const { res } = await deploy(
        { conclusion: 'failure' },
        { failOn: '/notices' }
      );
      expect(res.status).toBe(500);
    });

    it('still tries the notice when the build write fails, and answers 500', async () => {
      const { res, writes } = await deploy(
        { conclusion: 'success' },
        { failOn: '/builds' }
      );
      expect(res.status).toBe(500);
      expect(writes).toHaveLength(2);
    });

    it('answers 200 without writing for a cancelled run', async () => {
      const { res, fetch } = await deploy({ conclusion: 'cancelled' });
      expect(await res.text()).toBe('Ignored');
      expect(fetch).not.toHaveBeenCalled();
    });
  });
});
