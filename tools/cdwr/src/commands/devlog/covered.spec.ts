import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { EXIT } from '../../cli/errors';
import { memoryPrefs } from '../../cli/prefs';
import { runCommand } from '../../cli/run';
import { fakeUi } from '../../testing/fake-ui';

vi.mock('../../cli/preflight', () => ({ preflight: vi.fn() }));

const fetchMock = vi.fn();

type Env = Record<string, string | undefined>;

const run = async (argv: string[], env: Env) => {
  const command = (await import('./covered')).default;
  const out: string[] = [];
  const exit = await runCommand({
    name: 'devlog covered',
    command,
    argv,
    root: '/repo',
    env: env as NodeJS.ProcessEnv,
    prefs: memoryPrefs(),
    interactive: false,
    ui: fakeUi([], false),
    history: () => undefined,
    stdout: (text) => out.push(text)
  });
  return { exit, stdout: out.join('\n') };
};

const row = (postId: number, prs: number[]) => ({
  postId,
  prs,
  title: `Post ${postId}`,
  at: '2026-01-01T00:00:00.000Z'
});

// Payload sanitizes a granted permission to `true` and leaves a denied one out
const canDraft = (granted = true) =>
  new Response(
    JSON.stringify({ collections: { posts: granted ? { create: true } : {} } }),
    { status: 200 }
  );

describe('devlog covered', () => {
  let queue: string;
  let file: string;
  let env: Env;

  beforeEach(async () => {
    const home = await mkdtemp(join(tmpdir(), 'devlog-'));
    queue = join(home, 'agent-queue');
    await mkdir(queue, { recursive: true });
    file = join(queue, 'devlog-covered.jsonl');
    await writeFile(
      file,
      [row(1, [10]), row(2, [11]), row(3, [12])]
        .map((r) => JSON.stringify(r))
        .join('\n') + '\n'
    );
    env = {
      CDWR_HOME: home,
      CMS_URL: 'https://cms.test',
      CMS_AGENT_API_KEY: 'agent-key'
    };
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('writes each outcome back to the file', async () => {
    fetchMock
      .mockResolvedValueOnce(canDraft())
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ _status: 'published' }), { status: 200 })
      )
      .mockResolvedValueOnce(new Response('{}', { status: 404 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ _status: 'draft' }), { status: 200 })
      );

    const { exit, stdout } = await run(['--json'], env);

    expect(exit).toBe(EXIT.ok);
    expect(fetchMock.mock.calls[0][0]).toBe('https://cms.test/api/access');
    expect(fetchMock.mock.calls[2][0]).toBe(
      'https://cms.test/api/posts/2?trash=true'
    );
    expect(fetchMock.mock.calls[1][1].signal).toBeInstanceOf(AbortSignal);
    const rows = (await readFile(file, 'utf8'))
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    expect(rows.map((r) => r.outcome)).toEqual([
      'published',
      'deleted',
      'draft'
    ]);
    expect(rows.every((r) => r.checkedAt)).toBe(true);
    expect(stdout).toContain('"outcome":"deleted"');
  });

  it('leaves the file as it was when one read is refused', async () => {
    const before = await readFile(file, 'utf8');
    fetchMock
      .mockResolvedValueOnce(canDraft())
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ _status: 'published' }), { status: 200 })
      )
      .mockResolvedValueOnce(new Response('{}', { status: 403 }));

    const { exit } = await run([], env);

    expect(exit).toBe(EXIT.failed);
    expect(await readFile(file, 'utf8')).toBe(before);
  });

  it.each([
    ['may not create posts', () => canDraft(false)],
    ['is refused', () => new Response('{}', { status: 401 })]
  ])('reads no post back when the key %s', async (_name, answer) => {
    const before = await readFile(file, 'utf8');
    fetchMock.mockResolvedValueOnce(answer());

    const { exit, stdout } = await run(['--json'], env);

    expect(exit).toBe(EXIT.failed);
    expect(stdout).toContain('does not let CMS_AGENT_API_KEY draft posts');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await readFile(file, 'utf8')).toBe(before);
  });

  it('names the line and field of a malformed row', async () => {
    await writeFile(file, '{"postId":1,"title":"T","at":"x"}\n');

    const { exit, stdout } = await run(['--json'], env);

    expect(exit).toBe(EXIT.failed);
    expect(stdout).toContain('Line 1');
    expect(stdout).toContain('prs');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses a stored device id that is not a uuid', async () => {
    const idFile = join(queue, 'devlog-device-id');
    await writeFile(idFile, 'not-a-uuid\n');

    const { exit, stdout } = await run(['--json'], {
      ...env,
      CMS_SIGNATURE_SECRET: 'secret'
    });

    expect(exit).toBe(EXIT.failed);
    expect(stdout).toContain('does not hold a device id');
    expect(await readFile(idFile, 'utf8')).toBe('not-a-uuid\n');
  });

  it('leaves the file as it was when the network fails', async () => {
    const before = await readFile(file, 'utf8');
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));

    const { exit } = await run([], env);

    expect(exit).toBe(EXIT.failed);
    expect(await readFile(file, 'utf8')).toBe(before);
  });

  it('lists without asking the cms with --no-check', async () => {
    const { exit, stdout } = await run(['--no-check', '--json'], {
      CDWR_HOME: env['CDWR_HOME']
    });

    expect(exit).toBe(EXIT.ok);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(stdout).toContain('"postId":3');
  });

  it('prints an empty list when nothing was drafted', async () => {
    const { exit, stdout } = await run(['--json'], {
      CDWR_HOME: join(tmpdir(), 'devlog-nothing-here')
    });

    expect(exit).toBe(EXIT.ok);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(stdout).toContain('[]');
  });
});
