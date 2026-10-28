import { execFile, spawnSync } from 'node:child_process';
import { rmSync, writeFileSync } from 'node:fs';
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
        res.end('{}');
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
