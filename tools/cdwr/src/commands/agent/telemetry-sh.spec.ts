import { execFile, spawnSync } from 'node:child_process';
import { type Server, createServer } from 'node:http';
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
});
