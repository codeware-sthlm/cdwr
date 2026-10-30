import { spawn, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  utimesSync
} from 'node:fs';
import { type Server, createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = fileURLToPath(
  new URL('../../../agent-queue/statusline.sh', import.meta.url)
);

// The queue scripts run on macOS and Linux with zsh; a CI runner without it skips them
const hasZsh = spawnSync('zsh', ['-c', 'true']).status === 0;
const hasJq = spawnSync('jq', ['--version']).status === 0;

const PAYLOAD = {
  model: { display_name: 'Opus' },
  workspace: { current_dir: '/x/repo' },
  rate_limits: {
    five_hour: { used_percentage: 23.5, resets_at: 1738425600 },
    seven_day: { used_percentage: 41.2, resets_at: 1738857600 }
  }
};

interface Hit {
  method?: string;
  url?: string;
  headers: Record<string, string | string[] | undefined>;
  body: string;
}

describe.skipIf(!hasZsh || !hasJq)('statusline.sh', () => {
  let dir: string;
  let server: Server;
  let origin: string;
  let hits: Hit[];

  // Async, so the fake server answers the detached send while the script's pipes are still open
  const run = (payload: unknown) =>
    new Promise<{ status: number | null; stdout: string }>(
      (resolve, reject) => {
        const child = spawn('zsh', [SCRIPT], {
          env: {
            ...process.env,
            AGENT_QUEUE_HOME: dir,
            AGENT_QUEUE_ENV_FILE: '/dev/null',
            AGENT_SUPABASE_URL: origin,
            AGENT_SUPABASE_SERVICE_KEY: 'sb_secret_test'
          }
        });
        let stdout = '';
        child.stdout.on('data', (chunk) => (stdout += chunk));
        child.on('error', reject);
        child.on('close', (status) => resolve({ status, stdout }));
        child.stdin.end(
          typeof payload === 'string' ? payload : JSON.stringify(payload)
        );
      }
    );
  const file = (name: string) => join(dir, name);

  const waitForHit = async (timeout = 10_000) => {
    const end = Date.now() + timeout;
    while (hits.length === 0 && Date.now() < end) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  };

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
        res.writeHead(201);
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
    dir = mkdtempSync(join(tmpdir(), 'statusline-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('prints the model, the directory and both windows', async () => {
    const result = await run(PAYLOAD);
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe('Opus · repo · 5h 23% · 7d 41%');
  });

  it('prints only the model and directory without rate limits, and writes nothing', async () => {
    const result = await run({ ...PAYLOAD, rate_limits: undefined });
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe('Opus · repo');
    expect(existsSync(file('rate-limits.json'))).toBe(false);
    expect(existsSync(file('rate-limits.sent'))).toBe(false);
  });

  it('writes the two windows to rate-limits.json', async () => {
    await run(PAYLOAD);
    const written = JSON.parse(
      readFileSync(file('rate-limits.json'), 'utf8')
    ) as { at: string; rate_limits: unknown };
    expect(written.rate_limits).toEqual({
      five_hour: { used_percentage: 23.5, resets_at: 1738425600 },
      seven_day: { used_percentage: 41.2, resets_at: 1738857600 }
    });
    expect(written.at).toMatch(/^\d{4}-\d\d-\d\dT[\d:]+Z$/);
  });

  it('writes rate-limits.sent once and leaves it alone for the same values', async () => {
    await run(PAYLOAD);
    const sent = file('rate-limits.sent');
    expect(JSON.parse(readFileSync(sent, 'utf8'))).toEqual({
      five_hour: { used_percentage: 23.5, resets_at: 1738425600 },
      seven_day: { used_percentage: 41.2, resets_at: 1738857600 }
    });
    const old = new Date(Date.now() - 3_600_000);
    utimesSync(sent, old, old);
    const before = statSync(sent).mtimeMs;
    const second = await run(PAYLOAD);
    expect(second.status).toBe(0);
    expect(statSync(sent).mtimeMs).toBe(before);
  });

  it('returns before the send finishes', () => {
    // Sync, so the fake server can't answer while the script runs: a send holding stdout
    // would keep the pipe open until curl gave up
    const result = spawnSync('zsh', [SCRIPT], {
      input: JSON.stringify(PAYLOAD),
      env: {
        ...process.env,
        AGENT_QUEUE_HOME: dir,
        AGENT_QUEUE_ENV_FILE: '/dev/null',
        AGENT_SUPABASE_URL: origin,
        AGENT_SUPABASE_SERVICE_KEY: 'sb_secret_test'
      },
      encoding: 'utf8',
      timeout: 5_000
    });
    expect(result.signal).toBeNull();
    expect(result.status).toBe(0);
  });

  it('posts a row per window to plan_usage, ignoring duplicates', async () => {
    await run(PAYLOAD);
    await waitForHit();
    const post = hits.find((hit) => hit.method === 'POST');
    expect(post?.url).toBe(
      '/rest/v1/plan_usage?on_conflict=kind,resets_at,used_percentage'
    );
    expect(post?.headers['prefer']).toContain('resolution=ignore-duplicates');
    const rows = JSON.parse(post?.body ?? '') as Record<string, unknown>[];
    expect(rows).toEqual([
      {
        kind: 'five_hour',
        resets_at: '2025-02-01T16:00:00Z',
        used_percentage: 23.5,
        host: expect.any(String)
      },
      {
        kind: 'seven_day',
        resets_at: '2025-02-06T16:00:00Z',
        used_percentage: 41.2,
        host: expect.any(String)
      }
    ]);
  });

  it.each([[''], ['not json {'], ['{}']])(
    'exits 0 for the input %j',
    async (input) => {
      const result = await run(input);
      expect(result.status).toBe(0);
      expect(existsSync(file('rate-limits.json'))).toBe(false);
    }
  );
});
