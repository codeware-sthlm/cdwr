import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { EXIT } from '../../cli/errors';
import { memoryPrefs } from '../../cli/prefs';
import { runCommand } from '../../cli/run';
import { fakeUi } from '../../testing/fake-ui';

vi.mock('../../cli/preflight', () => ({ preflight: vi.fn() }));
vi.mock('./markdown', () => ({
  markdownToLexical: vi.fn(async () => ({ root: { type: 'root' } }))
}));

const fetchMock = vi.fn();

type Env = Record<string, string | undefined>;

const run = async (
  argv: string[],
  env: Env
): Promise<{ exit: number; stdout: string }> => {
  const command = (await import('./draft')).default;
  const ui = fakeUi([], false);
  const out: string[] = [];
  const exit = await runCommand({
    name: 'devlog draft',
    command,
    argv,
    root: '/repo',
    env: env as NodeJS.ProcessEnv,
    prefs: memoryPrefs(),
    interactive: false,
    ui,
    history: () => undefined,
    stdout: (text) => out.push(text)
  });
  return { exit, stdout: out.join('\n') };
};

const post = (body: string) =>
  `# A title\nMeta title: A meta title\nDescription: ${'d'.repeat(60)}\n\n${body}\n`;

const category = (docs: unknown[] = [{ id: 3 }]) =>
  new Response(JSON.stringify({ docs }), { status: 200 });
const created = () =>
  new Response(JSON.stringify({ doc: { id: 77 } }), { status: 201 });

describe('devlog draft', () => {
  let home: string;
  let file: string;
  let env: Env;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), 'devlog-'));
    file = join(home, 'post.md');
    await writeFile(file, post('Some body text'));
    env = {
      CDWR_HOME: home,
      CMS_URL: 'https://cms.test/',
      CMS_AGENT_API_KEY: 'agent-key'
    };
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const args = (...extra: string[]) => [
    '--file',
    file,
    '--covers',
    '412,415,412',
    '--yes',
    '--json',
    ...extra
  ];

  it('creates the draft and records what it covers', async () => {
    fetchMock
      .mockResolvedValueOnce(category())
      .mockResolvedValueOnce(created());

    const { exit, stdout } = await run(args(), env);

    expect(exit).toBe(EXIT.ok);
    expect(stdout).toContain('"postId":77');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [categoryCall, [url, init]] = fetchMock.mock.calls;
    expect(categoryCall[0]).toBe(
      'https://cms.test/api/categories?where%5Bslug%5D%5Bequals%5D=devlog&limit=1&depth=0'
    );
    expect(categoryCall[1].headers).toEqual(init.headers);
    expect(url).toBe('https://cms.test/api/posts?draft=true');
    expect(init.method).toBe('POST');
    expect(init.headers['Authorization']).toBe('agents API-Key agent-key');
    expect(init.headers['X-Signature']).toBeUndefined();
    expect(JSON.parse(init.body)).toEqual({
      title: 'A title',
      content: { root: { type: 'root' } },
      meta: { title: 'A meta title', description: 'd'.repeat(60) },
      categories: [3],
      _status: 'draft'
    });

    const rows = (
      await readFile(join(home, 'agent-queue', 'devlog-covered.jsonl'), 'utf8')
    )
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    expect(rows).toEqual([
      expect.objectContaining({ postId: 77, prs: [412, 415], title: 'A title' })
    ]);
    expect(rows[0].outcome).toBeUndefined();

    // The device id is made once and reused
    const id = await readFile(
      join(home, 'agent-queue', 'devlog-device-id'),
      'utf8'
    );
    expect(id.trim()).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('sends nothing on a dry run', async () => {
    const { exit } = await run(args('--dry-run'), env);

    expect(exit).toBe(EXIT.ok);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fails with the cms message on anything but 201, and records nothing', async () => {
    fetchMock.mockResolvedValueOnce(category()).mockResolvedValueOnce(
      new Response(JSON.stringify({ errors: [{ message: 'Forbidden' }] }), {
        status: 403
      })
    );

    const { exit, stdout } = await run(args(), env);

    expect(exit).toBe(EXIT.failed);
    expect(stdout).toContain('403: Forbidden');
    await expect(
      readFile(join(home, 'agent-queue', 'devlog-covered.jsonl'), 'utf8')
    ).rejects.toThrow(/ENOENT/);
  });

  it('fails before any POST when the category is missing', async () => {
    fetchMock.mockResolvedValueOnce(category([]));

    const { exit, stdout } = await run(args(), env);

    expect(exit).toBe(EXIT.failed);
    expect(stdout).toContain('no category with the slug devlog');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('fails before any POST when the category read is refused', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ errors: [{ message: 'Forbidden' }] }), {
        status: 403
      })
    );

    const { exit, stdout } = await run(args(), env);

    expect(exit).toBe(EXIT.failed);
    expect(stdout).toContain('403 when reading the devlog category');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('refuses a draft without the meta lines before asking the cms', async () => {
    await writeFile(file, '# T\n\nBody\n');

    const { exit } = await run(args(), env);

    expect(exit).toBe(EXIT.failed);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses a draft with a code fence before asking the cms', async () => {
    await writeFile(file, post('```\ncode\n```'));

    const { exit } = await run(args(), env);

    expect(exit).toBe(EXIT.failed);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('validates a dry run without credentials', async () => {
    const { exit } = await run(args('--dry-run'), { CDWR_HOME: home });

    expect(exit).toBe(EXIT.ok);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('needs the credentials', async () => {
    const { exit } = await run(args(), { CDWR_HOME: home });

    expect(exit).toBe(EXIT.failed);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
