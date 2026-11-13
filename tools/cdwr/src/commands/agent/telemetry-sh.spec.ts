import { execFile, spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs';
import { type Server, createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const TELEMETRY_SH = fileURLToPath(
  new URL('../../../agent-queue/telemetry.sh', import.meta.url)
);
const execAsync = promisify(execFile);
const hasZsh = spawnSync('zsh', ['-c', 'true']).status === 0;

const KEY = 'sb_secret_0123456789abcdef';

interface Hit {
  method?: string;
  url?: string;
  headers: Record<string, string | string[] | undefined>;
  body: string;
}

describe.skipIf(!hasZsh)('telemetry.sh', () => {
  let server: Server;
  let origin: string;
  let hits: Hit[];
  let status: number;
  // What the fake server answers with
  let reply: string;

  // Runs a snippet with telemetry.sh sourced; the fake server shares this process, so async
  const zsh = async (
    env: Record<string, string>,
    snippet: string,
    prelude = ''
  ) => {
    const { stdout, stderr } = await execAsync(
      'zsh',
      ['-c', `${prelude}\nsource "${TELEMETRY_SH}"\n${snippet}\necho "rc=$?"`],
      { env: { PATH: process.env['PATH'] ?? '', ...env } }
    );
    return { stdout: stdout.trim(), stderr: stderr.trim() };
  };

  const configured = () => ({
    AGENT_SUPABASE_URL: `${origin}/`,
    AGENT_SUPABASE_SERVICE_KEY: KEY
  });

  beforeAll(async () => {
    server = createServer((req, res) => {
      let raw = '';
      req.on('data', (chunk) => (raw += chunk));
      req.on('end', () => {
        hits.push({
          method: req.method,
          url: req.url,
          headers: req.headers,
          body: raw
        });
        res.writeHead(status);
        res.end(reply);
      });
    });
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve)
    );
    const address = server.address();
    if (address === null || typeof address === 'string') {
      throw new Error('no port');
    }
    origin = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  beforeEach(() => {
    hits = [];
    status = 201;
    reply = '{}';
  });

  it.each([
    [{}],
    [{ AGENT_SUPABASE_URL: 'http://127.0.0.1:1' }],
    [{ AGENT_SUPABASE_SERVICE_KEY: KEY }]
  ])('does nothing and succeeds when %j is not enough', async (env) => {
    const out = await zsh(
      env,
      `supabase_insert runs '{"a":1}'\nsupabase_upsert usage day '{"a":1}'`
    );
    expect(out.stdout).toBe('rc=0');
    expect(out.stderr).toBe('');
    expect(hits).toEqual([]);
  });

  it('posts a row with the key headers and minimal return', async () => {
    const out = await zsh(
      configured(),
      `supabase_insert runs '{"outcome":"idle"}'`
    );
    expect(out.stdout).toBe('rc=0');
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({
      method: 'POST',
      url: '/rest/v1/runs',
      body: '{"outcome":"idle"}'
    });
    expect(hits[0]?.headers['apikey']).toBe(KEY);
    expect(hits[0]?.headers['authorization']).toBe(`Bearer ${KEY}`);
    expect(hits[0]?.headers['content-type']).toBe('application/json');
    expect(hits[0]?.headers['prefer']).toBe('return=minimal');
  });

  it.each([
    [undefined, 'merge-duplicates'],
    ['merge', 'merge-duplicates'],
    ['ignore', 'ignore-duplicates']
  ])('upserts with %s resolution', async (mode, resolution) => {
    await zsh(
      configured(),
      `supabase_upsert usage 'day,ticket' '[{"a":1}]' ${mode ?? ''}`
    );
    expect(hits[0]?.url).toBe('/rest/v1/usage?on_conflict=day,ticket');
    expect(hits[0]?.headers['prefer']).toBe(
      `resolution=${resolution},return=minimal`
    );
    expect(hits[0]?.body).toBe('[{"a":1}]');
  });

  it('warns on stderr, returns 0 and never prints the key when the call fails', async () => {
    status = 401;
    const out = await zsh(configured(), `supabase_insert runs '{}'`);
    expect(out.stdout).toBe('rc=0');
    expect(out.stderr).toContain('warn: supabase runs failed');
    expect(out.stderr).not.toContain(KEY);
    expect(out.stdout).not.toContain(KEY);
  });

  it('warns through note when the caller defines it', async () => {
    status = 500;
    const out = await zsh(
      configured(),
      `supabase_insert runs '{}'`,
      'note() { print -r -- "NOTE $*"; }'
    );
    expect(out.stdout).toContain('NOTE warn: supabase runs failed');
    expect(out.stdout).toContain('rc=0');
    expect(out.stdout).not.toContain(KEY);
  });

  it('returns 0 and warns when nothing listens', async () => {
    const out = await zsh(
      { ...configured(), AGENT_SUPABASE_URL: 'http://127.0.0.1:1' },
      `supabase_insert runs '{}'`
    );
    expect(out.stdout).toBe('rc=0');
    expect(out.stderr).toContain('warn: supabase runs failed');
    expect(out.stderr).not.toContain(KEY);
  });

  describe('supabase_select and supabase_patch', () => {
    beforeEach(() => (reply = '[{"id":1},{"id":2}]'));
    const answering = zsh;

    it('selects the rows a query matches', async () => {
      status = 200;
      const out = await answering(
        configured(),
        `supabase_select runs 'select=id&limit=2'`
      );
      expect(out.stdout).toBe('[{"id":1},{"id":2}]\nrc=0');
      expect(hits[0]).toMatchObject({
        method: 'GET',
        url: '/rest/v1/runs?select=id&limit=2'
      });
      expect(hits[0]?.headers['apikey']).toBe(KEY);
      expect(hits[0]?.headers['authorization']).toBe(`Bearer ${KEY}`);
    });

    it('selects [] and warns when the call fails, without the key', async () => {
      status = 401;
      const out = await answering(configured(), `supabase_select runs 'a=b'`);
      expect(out.stdout).toBe('[]\nrc=0');
      expect(out.stderr).toContain('warn: supabase runs?a=b failed');
      expect(out.stderr).not.toContain(KEY);
    });

    it('warns through note when the caller defines it', async () => {
      status = 500;
      const out = await answering(
        configured(),
        `supabase_select runs 'a=b'`,
        'note() { print -r -- "NOTE $*"; }'
      );
      expect(out.stdout).toContain('NOTE warn: supabase runs?a=b failed');
      expect(out.stdout).not.toContain(KEY);
    });

    it('selects [] when the body is not an array', async () => {
      status = 200;
      reply = '{"message":"nope"}';
      const out = await answering(configured(), `supabase_select runs 'a=b'`);
      expect(out.stdout).toBe('[]\nrc=0');
    });

    it.each([
      [{}],
      [{ AGENT_SUPABASE_URL: 'http://127.0.0.1:1' }],
      [{ AGENT_SUPABASE_SERVICE_KEY: KEY }]
    ])('prints [] without calling when %j is not enough', async (env) => {
      const out = await zsh(
        env,
        `supabase_select runs 'a=b'\nsupabase_patch runs 'a=b' '{"x":1}'`
      );
      expect(out.stdout).toBe('[]\n[]\nrc=0');
      expect(out.stderr).toBe('');
      expect(hits).toEqual([]);
    });

    it('patches with the body and Prefer header and prints the returned rows', async () => {
      status = 200;
      reply = '[{"id":1,"x":1}]';
      const out = await answering(
        configured(),
        `supabase_patch queue_state 'host=eq.nuc' '{"x":1}'`
      );
      expect(out.stdout).toBe('[{"id":1,"x":1}]\nrc=0');
      expect(hits[0]).toMatchObject({
        method: 'PATCH',
        url: '/rest/v1/queue_state?host=eq.nuc',
        body: '{"x":1}'
      });
      expect(hits[0]?.headers['prefer']).toBe('return=representation');
      expect(hits[0]?.headers['content-type']).toBe('application/json');
      expect(hits[0]?.headers['apikey']).toBe(KEY);
    });

    it('patches [] and warns without the key when the call fails', async () => {
      status = 400;
      const out = await answering(
        configured(),
        `supabase_patch runs 'a=b' '{}'`
      );
      expect(out.stdout).toBe('[]\nrc=0');
      expect(out.stderr).toContain('warn: supabase runs?a=b failed');
      expect(out.stderr).not.toContain(KEY);
    });

    it('keeps the key out of curl arguments', async () => {
      status = 200;
      const dir = mkdtempSync(join(tmpdir(), 'fake-curl-'));
      try {
        const argv = join(dir, 'argv');
        writeFileSync(
          join(dir, 'curl'),
          `#!/bin/sh\nprintf '%s\\n' "$@" > "${argv}"\ncat >/dev/null\necho '[]'\n`,
          { mode: 0o755 }
        );
        const out = await zsh(
          {
            ...configured(),
            PATH: `${dir}:${process.env['PATH'] ?? ''}`
          },
          `supabase_select runs 'a=b' >/dev/null\nsupabase_patch runs 'a=b' '{}' >/dev/null`
        );
        expect(out.stdout).toBe('rc=0');
        const args = readFileSync(argv, 'utf8');
        expect(args).toContain('PATCH');
        expect(args).toContain('-K');
        expect(args).not.toContain(KEY);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  });

  describe('telemetry_run', () => {
    it('posts one runs row with the job as jsonb', async () => {
      const out = await zsh(
        configured(),
        `telemetry_run 2026-10-27T10:00:00Z 'planned' COD-9 'log x' true plan 600 5 'install current'`
      );
      expect(out.stdout).toBe('rc=0');
      expect(hits).toHaveLength(1);
      expect(hits[0]?.url).toBe('/rest/v1/runs');
      const body = JSON.parse(hits[0]?.body ?? '') as Record<string, unknown>;
      expect(body).toMatchObject({
        started_at: '2026-10-27T10:00:00Z',
        outcome: 'planned',
        ticket: 'COD-9',
        detail: 'log x',
        attended: true,
        job: {
          kind: 'plan',
          interval: 600,
          limit: 5,
          version: 'install current'
        }
      });
      expect(typeof body['host']).toBe('string');
      expect(body['finished_at']).toMatch(/^\d{4}-\d\d-\d\dT[\d:]+Z$/);
    });

    it('turns empty fields into null and survives quotes in the detail', async () => {
      await zsh(
        configured(),
        `telemetry_run 2026-10-27T10:00:00Z idle '' 'say "hi" \\ there' '' suggest '' '' ''`
      );
      expect(JSON.parse(hits[0]?.body ?? '')).toMatchObject({
        ticket: null,
        detail: 'say "hi" \\ there',
        attended: null,
        job: { kind: 'suggest', interval: null, limit: null, version: null }
      });
    });

    it('sends nothing without the env vars', async () => {
      const out = await zsh(
        {},
        `telemetry_run 2026-10-27T10:00:00Z idle '' '' '' plan '' '' ''`
      );
      expect(out.stdout).toBe('rc=0');
      expect(hits).toEqual([]);
    });
  });

  describe('telemetry_env_search', () => {
    it('unexports the service key before searching, even when nothing is read', async () => {
      const out = await zsh(
        {
          AGENT_SUPABASE_URL: 'https://x.supabase.co',
          AGENT_SUPABASE_SERVICE_KEY: 'k'
        },
        `telemetry_env_search /nonexistent; print -r -- "\${(t)AGENT_SUPABASE_SERVICE_KEY}"`
      );
      expect(out.stdout).toBe('scalar\nrc=0');
    });
  });

  describe('telemetry_queue_state', () => {
    it('upserts the host row on host, with the view as jsonb', async () => {
      const view = JSON.stringify({ next: 'COD-9', limit: { max: 5 } });
      const out = await zsh(
        configured(),
        `telemetry_queue_state '2026-10-28 10:00 · idle' 'Attended: yes' 'Suggested: nothing' 'Job: every 10 min' '${view}'`
      );
      expect(out.stdout).toBe('rc=0');
      expect(hits).toHaveLength(1);
      expect(hits[0]?.url).toBe('/rest/v1/queue_state?on_conflict=host');
      expect(hits[0]?.headers['prefer']).toContain(
        'resolution=merge-duplicates'
      );
      const body = JSON.parse(hits[0]?.body ?? '') as Record<string, unknown>;
      expect(body).toMatchObject({
        last_run: '2026-10-28 10:00 · idle',
        attended: 'Attended: yes',
        suggested: 'Suggested: nothing',
        job: 'Job: every 10 min',
        view: { next: 'COD-9', limit: { max: 5 } }
      });
      expect(typeof body['host']).toBe('string');
      expect(body['at']).toMatch(/^\d{4}-\d\d-\d\dT[\d:]+Z$/);
    });

    // A single argument holds at most 128 KB; the view is bigger than that on a busy queue
    it('posts a view of 300 KB intact', async () => {
      const view = JSON.stringify({ pad: 'x'.repeat(300_000) });
      writeFileSync(join(tmpdir(), 'big-view.json'), view);
      const out = await zsh(
        configured(),
        `telemetry_queue_state 'x' '' '' '' "$(cat '${join(tmpdir(), 'big-view.json')}')"`
      );
      expect(out.stdout).toBe('rc=0');
      expect(hits).toHaveLength(1);
      const body = JSON.parse(hits[0]?.body ?? '') as {
        view: { pad: string };
      };
      expect(body.view.pad).toHaveLength(300_000);
    });

    it('turns empty fields and an invalid view into null', async () => {
      await zsh(configured(), `telemetry_queue_state 'x' '' '' '' ''`);
      await zsh(
        configured(),
        `telemetry_queue_state 'x' '' '' '' 'not json {'`
      );
      expect(hits).toHaveLength(2);
      for (const hit of hits) {
        expect(JSON.parse(hit.body)).toMatchObject({
          last_run: 'x',
          attended: null,
          suggested: null,
          job: null,
          view: null
        });
      }
    });

    describe('the watch', () => {
      const watch = '{"COD-1":{"pr":12,"state":"open","unresolved":1}}';

      it('patches it onto the host row after the upsert', async () => {
        await zsh(
          configured(),
          `telemetry_queue_state 'x' '' '' '' '' '${watch}'`
        );
        expect(hits).toHaveLength(2);
        expect(hits[0]?.method).toBe('POST');
        const host = (JSON.parse(hits[0]?.body ?? '') as { host: string }).host;
        expect(hits[1]?.method).toBe('PATCH');
        expect(hits[1]?.url).toBe(
          `/rest/v1/queue_state?host=eq.${encodeURIComponent(host)}`
        );
        expect(JSON.parse(hits[1]?.body ?? '')).toEqual({
          watch: JSON.parse(watch)
        });
      });

      it('sends the upsert only when it is absent', async () => {
        await zsh(configured(), `telemetry_queue_state 'x' '' '' '' ''`);
        expect(hits).toHaveLength(1);
      });

      // A host whose watch.json is gone must not keep serving its last one
      it('clears the column when it is empty', async () => {
        await zsh(configured(), `telemetry_queue_state 'x' '' '' '' '' ''`);
        expect(hits).toHaveLength(2);
        expect(JSON.parse(hits[1]?.body ?? '')).toEqual({ watch: null });
      });

      it('patches null for an invalid one', async () => {
        await zsh(
          configured(),
          `telemetry_queue_state 'x' '' '' '' '' 'not json {'`
        );
        expect(hits).toHaveLength(2);
        expect(JSON.parse(hits[1]?.body ?? '')).toEqual({ watch: null });
      });
    });

    describe('the renovate state', () => {
      const renovate = '{"754":{"pr":754,"state":"failing","ticket":null}}';

      it('patches it in a patch of its own, after the watch', async () => {
        await zsh(
          configured(),
          `telemetry_queue_state 'x' '' '' '' '' '{}' '${renovate}'`
        );
        expect(hits).toHaveLength(3);
        const host = (JSON.parse(hits[0]?.body ?? '') as { host: string }).host;
        expect(hits[1]?.method).toBe('PATCH');
        expect(JSON.parse(hits[1]?.body ?? '')).toEqual({ watch: {} });
        expect(hits[2]?.method).toBe('PATCH');
        expect(hits[2]?.url).toBe(
          `/rest/v1/queue_state?host=eq.${encodeURIComponent(host)}`
        );
        expect(JSON.parse(hits[2]?.body ?? '')).toEqual({
          renovate: JSON.parse(renovate)
        });
      });

      it('patches null when it is empty or invalid', async () => {
        await zsh(configured(), `telemetry_queue_state 'x' '' '' '' '' '' ''`);
        await zsh(
          configured(),
          `telemetry_queue_state 'x' '' '' '' '' '' 'not json {'`
        );
        expect(hits).toHaveLength(6);
        expect(JSON.parse(hits[2]?.body ?? '')).toEqual({ renovate: null });
        expect(JSON.parse(hits[5]?.body ?? '')).toEqual({ renovate: null });
      });

      it('sends no patch for it when absent', async () => {
        await zsh(configured(), `telemetry_queue_state 'x' '' '' '' '' '{}'`);
        expect(hits).toHaveLength(2);
        expect(hits.every((h) => !h.body.includes('renovate'))).toBe(true);
      });
    });

    describe('the devlog line', () => {
      const devlog = '2026-11-13 · nothing this week';

      it('patches it in a patch of its own, after the renovate state', async () => {
        await zsh(
          configured(),
          `telemetry_queue_state 'x' '' '' '' '' '{}' '{}' '${devlog}'`
        );
        expect(hits).toHaveLength(4);
        const host = (JSON.parse(hits[0]?.body ?? '') as { host: string }).host;
        expect(hits[3]?.method).toBe('PATCH');
        expect(hits[3]?.url).toBe(
          `/rest/v1/queue_state?host=eq.${encodeURIComponent(host)}`
        );
        expect(JSON.parse(hits[3]?.body ?? '')).toEqual({ devlog });
      });

      it('patches null when it is empty', async () => {
        await zsh(
          configured(),
          `telemetry_queue_state 'x' '' '' '' '' '{}' '{}' ''`
        );
        expect(hits).toHaveLength(4);
        expect(JSON.parse(hits[3]?.body ?? '')).toEqual({ devlog: null });
      });

      it('sends no patch for it when absent', async () => {
        await zsh(
          configured(),
          `telemetry_queue_state 'x' '' '' '' '' '{}' '{}'`
        );
        expect(hits).toHaveLength(3);
        expect(hits.every((h) => !h.body.includes('devlog'))).toBe(true);
      });
    });

    it('sends nothing without the env vars', async () => {
      const out = await zsh({}, `telemetry_queue_state x '' '' '' ''`);
      expect(out.stdout).toBe('rc=0');
      expect(hits).toEqual([]);
    });
  });

  describe('telemetry_session', () => {
    it('upserts the heartbeat on id', async () => {
      await zsh(configured(), `telemetry_session abc attended`);
      expect(hits[0]?.url).toBe('/rest/v1/sessions?on_conflict=id');
      expect(JSON.parse(hits[0]?.body ?? '')).toMatchObject({
        id: 'abc',
        kind: 'attended'
      });
    });

    it('sends the state and detail', async () => {
      await zsh(configured(), `telemetry_session abc attended ended other`);
      expect(JSON.parse(hits[0]?.body ?? '')).toMatchObject({
        state: 'ended',
        detail: 'other'
      });
    });

    it('sends null state and detail when omitted', async () => {
      await zsh(configured(), `telemetry_session abc attended`);
      const body = JSON.parse(hits[0]?.body ?? '');
      expect(body.state).toBeNull();
      expect(body.detail).toBeNull();
    });
  });

  describe('telemetry_host_metrics', () => {
    let root: string;

    const fixture = (cgroupMax: string | null) => {
      mkdirSync(join(root, 'proc'), { recursive: true });
      mkdirSync(join(root, 'sys/fs/cgroup'), { recursive: true });
      writeFileSync(join(root, 'proc/loadavg'), '0.52 1.25 2.50 1/300 4242\n');
      writeFileSync(
        join(root, 'proc/cpuinfo'),
        'processor\t: 0\nmodel name\t: x\n\nprocessor\t: 1\nmodel name\t: x\n\nprocessor\t: 2\nmodel name\t: x\n'
      );
      writeFileSync(
        join(root, 'proc/meminfo'),
        'MemTotal:        8000000 kB\nMemFree:          100000 kB\nMemAvailable:    3000000 kB\nSwapTotal:       2000000 kB\nSwapFree:        1500000 kB\n'
      );
      writeFileSync(join(root, 'sys/fs/cgroup/memory.current'), '123456\n');
      if (cgroupMax !== null) {
        writeFileSync(join(root, 'sys/fs/cgroup/memory.max'), `${cgroupMax}\n`);
      }
    };

    const env = (os = 'Linux') => ({
      ...configured(),
      HOST_METRICS_OS: os,
      HOST_METRICS_PROC: join(root, 'proc'),
      HOST_METRICS_SYS: join(root, 'sys'),
      HOST_METRICS_DISK: root
    });

    beforeEach(() => {
      root = mkdtempSync(join(tmpdir(), 'host-metrics-'));
    });
    afterEach(() => rmSync(root, { recursive: true, force: true }));

    it('inserts one row, then prunes this host past 7 days', async () => {
      fixture('4294967296');
      const out = await zsh(env(), 'telemetry_host_metrics');
      expect(out.stdout).toBe('rc=0');
      expect(hits).toHaveLength(2);
      expect(hits[0]).toMatchObject({
        method: 'POST',
        url: '/rest/v1/host_metrics'
      });
      const body = JSON.parse(hits[0]?.body ?? '') as Record<string, unknown>;
      expect(body).toMatchObject({
        load1: 0.52,
        load5: 1.25,
        load15: 2.5,
        mem_total: 8000000 * 1024,
        mem_available: 3000000 * 1024,
        swap_total: 2000000 * 1024,
        swap_free: 1500000 * 1024,
        cgroup_mem_current: 123456,
        cgroup_mem_max: 4294967296
      });
      expect(typeof body['host']).toBe('string');
      expect(body['cores']).toBe(3);
      expect(body['disk_free']).toBeGreaterThan(0);
      expect(body['disk_total']).toBeGreaterThanOrEqual(
        Number(body['disk_free'])
      );

      expect(hits[1]?.method).toBe('DELETE');
      const url = new URL(hits[1]?.url ?? '', origin);
      expect(url.pathname).toBe('/rest/v1/host_metrics');
      expect(url.searchParams.get('host')).toBe(`eq.${String(body['host'])}`);
      const cutoff = Date.parse(
        (url.searchParams.get('at') ?? '').replace('lt.', '')
      );
      expect(Date.now() - cutoff).toBeGreaterThan(7 * 86400_000 - 60_000);
      expect(Date.now() - cutoff).toBeLessThan(7 * 86400_000 + 60_000);
      expect(hits[1]?.headers['apikey']).toBe(KEY);
    });

    it.each([['max'], [null]])(
      'sends a null cgroup limit when memory.max is %j',
      async (max) => {
        fixture(max);
        await zsh(env(), 'telemetry_host_metrics');
        expect(JSON.parse(hits[0]?.body ?? '')).toMatchObject({
          cgroup_mem_current: 123456,
          cgroup_mem_max: null
        });
      }
    );

    it('falls back to nproc when cpuinfo is missing', async () => {
      fixture('max');
      rmSync(join(root, 'proc/cpuinfo'));
      await zsh(env(), 'telemetry_host_metrics');
      expect(
        Number((JSON.parse(hits[0]?.body ?? '') as { cores: number }).cores)
      ).toBeGreaterThan(0);
    });

    it('writes nothing on Darwin', async () => {
      fixture('max');
      const out = await zsh(env('Darwin'), 'telemetry_host_metrics');
      expect(out.stdout).toBe('rc=0');
      expect(hits).toEqual([]);
    });

    it('writes nothing without the env vars or the proc files', async () => {
      fixture('max');
      await zsh({ ...env(), AGENT_SUPABASE_URL: '' }, 'telemetry_host_metrics');
      rmSync(join(root, 'proc'), { recursive: true });
      const out = await zsh(env(), 'telemetry_host_metrics');
      expect(out.stdout).toBe('rc=0');
      expect(hits).toEqual([]);
    });
  });

  describe('telemetry_env and children', () => {
    const file = join(tmpdir(), `telemetry-env-child-${process.pid}`);
    afterEach(() => rmSync(file, { force: true }));

    it('keeps the key out of a child environment, read from a file or already exported', async () => {
      writeFileSync(
        file,
        'AGENT_SUPABASE_URL=https://x.supabase.co\nAGENT_SUPABASE_SERVICE_KEY=filekey\n'
      );
      const fromFile = await zsh(
        {},
        `telemetry_env "${file}"\nenv | grep -c AGENT_SUPABASE_SERVICE_KEY`
      );
      expect(fromFile.stdout.split('\n')[0]).toBe('0');
      const exported = await zsh(
        {
          AGENT_SUPABASE_URL: 'https://u',
          AGENT_SUPABASE_SERVICE_KEY: 'envkey'
        },
        `telemetry_env "${file}"\nenv | grep -c AGENT_SUPABASE_SERVICE_KEY\nprint -r -- "$AGENT_SUPABASE_SERVICE_KEY"`
      );
      expect(exported.stdout.split('\n').slice(0, 2)).toEqual(['0', 'envkey']);
      // The shell itself still sends with it
      status = 201;
      await zsh(
        { AGENT_SUPABASE_URL: origin, AGENT_SUPABASE_SERVICE_KEY: KEY },
        `telemetry_env "${file}"\nsupabase_insert runs '{}'`
      );
      expect(hits[0]?.headers['apikey']).toBe(KEY);
    });
  });

  describe('telemetry_env', () => {
    const file = join(tmpdir(), `telemetry-env-${process.pid}`);
    afterEach(() => rmSync(file, { force: true }));

    it('reads the two variables as text and lets the environment win', async () => {
      writeFileSync(
        file,
        `OTHER=1\nAGENT_SUPABASE_URL="https://x.supabase.co"\nAGENT_SUPABASE_SERVICE_KEY='k$(touch ${file}.pwned)'\n`
      );
      const out = await zsh(
        {},
        `telemetry_env "${file}"\nprint -r -- "$AGENT_SUPABASE_URL|$AGENT_SUPABASE_SERVICE_KEY|\${OTHER:-}"`
      );
      expect(out.stdout.split('\n')[0]).toBe(
        'https://x.supabase.co|k$(touch ' + file + '.pwned)|'
      );
      const kept = await zsh(
        { AGENT_SUPABASE_URL: 'https://set', AGENT_SUPABASE_SERVICE_KEY: 'kk' },
        `telemetry_env "${file}"\nprint -r -- "$AGENT_SUPABASE_URL"`
      );
      expect(kept.stdout.split('\n')[0]).toBe('https://set');
    });
  });
});
