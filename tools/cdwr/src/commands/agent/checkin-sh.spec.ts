import { execFile, spawnSync } from 'node:child_process';
import { type Server, createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const CHECKIN_SH = fileURLToPath(
  new URL('../../../agent-queue/checkin.sh', import.meta.url)
);
const execAsync = promisify(execFile);
const hasZsh = spawnSync('zsh', ['-c', 'true']).status === 0;
const hasJq = spawnSync('jq', ['--version']).status === 0;

interface Hit {
  method?: string;
  url?: string;
  body: Record<string, unknown>;
}

describe.skipIf(!hasZsh || !hasJq)('checkin.sh', () => {
  let server: Server;
  let origin: string;
  let hits: Hit[];
  let status: number;

  // Runs a snippet with checkin.sh sourced; the fake server shares this process, so async
  const zsh = async (dsn: string | undefined, snippet: string) => {
    const env: Record<string, string> = { PATH: process.env['PATH'] ?? '' };
    if (dsn !== undefined) env['SENTRY_DSN'] = dsn;
    const { stdout, stderr } = await execAsync(
      'zsh',
      ['-c', `source "${CHECKIN_SH}"\n${snippet}`],
      { env }
    );
    return { stdout: stdout.trim(), stderr: stderr.trim() };
  };

  const dsn = () => origin.replace('http://', 'http://abc123@') + '/42';

  beforeAll(async () => {
    server = createServer((req, res) => {
      let raw = '';
      req.on('data', (chunk) => (raw += chunk));
      req.on('end', () => {
        hits.push({
          method: req.method,
          url: req.url,
          body: JSON.parse(raw || '{}') as Record<string, unknown>
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
    status = 202;
  });

  describe('checkin_url', () => {
    it('derives the cron endpoint from the DSN', async () => {
      const out = await zsh(
        'https://abc123@o1.ingest.sentry.io/42',
        'checkin_url'
      );
      expect(out.stdout).toBe(
        'https://o1.ingest.sentry.io/api/42/cron/agent-queue/abc123/'
      );
    });

    it.each([undefined, '', 'not a dsn', 'https://o1.ingest.sentry.io/42'])(
      'is empty for %j',
      async (value) => {
        expect((await zsh(value, 'checkin_url')).stdout).toBe('');
      }
    );
  });

  it('sends nothing without a DSN', async () => {
    const out = await zsh(undefined, 'checkin in_progress; checkin ok x');
    expect(out.stdout).toBe('');
    expect(hits).toEqual([]);
  });

  const monitorConfig = {
    schedule: { type: 'interval', value: 10, unit: 'minute' },
    checkin_margin: 15,
    max_runtime: 60,
    timezone: 'UTC'
  };

  it('opens with an id and the monitor config', async () => {
    const out = await zsh(dsn(), 'checkin in_progress');
    expect(out.stdout).toMatch(/^[0-9a-f-]{36}$/);
    expect(hits).toHaveLength(1);
    expect(hits[0].method).toBe('POST');
    expect(hits[0].url).toBe('/api/42/cron/agent-queue/abc123/');
    expect(hits[0].body).toEqual({
      check_in_id: out.stdout,
      status: 'in_progress',
      monitor_config: monitorConfig
    });
  });

  // Upsert on every check-in: whichever reaches Sentry first creates the monitor
  it.each(['ok', 'error'])(
    'closes with %s, the same id and the monitor config',
    async (state) => {
      await zsh(dsn(), `checkin ${state} the-id`);
      expect(hits.map((hit) => hit.body)).toEqual([
        { status: state, check_in_id: 'the-id', monitor_config: monitorConfig }
      ]);
    }
  );

  it('sends a one-shot ok without an id, with the monitor config', async () => {
    await zsh(dsn(), 'checkin ok');
    expect(hits.map((hit) => hit.body)).toEqual([
      { status: 'ok', monitor_config: monitorConfig }
    ]);
  });

  it('notes a server error and returns 0', async () => {
    status = 500;
    const out = await zsh(
      dsn(),
      'note() { print -r -- "noted: $*"; }; checkin ok x; print -r -- "rc=$?"'
    );
    expect(out.stdout).toContain('noted: warn: sentry check-in ok failed');
    expect(out.stdout).toContain('rc=0');
  });

  it('writes to stderr without a note function', async () => {
    status = 500;
    const out = await zsh(dsn(), 'checkin ok x; print -r -- "rc=$?"');
    expect(out.stderr).toContain('sentry check-in ok failed');
    expect(out.stdout).toBe('rc=0');
  });
});
