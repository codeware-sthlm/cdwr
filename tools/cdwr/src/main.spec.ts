import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const PIPE_BUFFER = 65_536;
const ROWS = 200;

const pad = (n: number) => String(n).padStart(2, '0');
/** Local `YYYY-MM-DD HH:MM`, as the scheduler writes it */
const localWhen = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;

describe('cdwr entry point', () => {
  let dir: string;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'cdwr-main-'));
  });
  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('delivers all of a large --json document to a slow pipe reader', () => {
    const runs = join(dir, 'runs.jsonl');
    const stdin = join(dir, 'linear.json');
    const now = Date.now();
    writeFileSync(
      runs,
      Array.from({ length: ROWS }, (_, i) =>
        JSON.stringify({
          when: localWhen(new Date(now - (i + 1) * 60_000)),
          outcome: 'ok',
          ticket: `COD-${i}`,
          detail: `row ${i} ${'x'.repeat(600)}`
        })
      ).join('\n') + '\n'
    );
    writeFileSync(stdin, '{"data":{"issues":{"nodes":[]}}}');

    // The reader sleeps before it reads, so the pipe is full when main() resolves
    const result = spawnSync(
      'sh',
      [
        '-c',
        `node tools/cdwr/bin/cdwr.mjs agent activity --runs "$RUNS" --days 7 --limit ${ROWS} --json < "$IN" | (sleep 1; cat)`
      ],
      {
        cwd: REPO_ROOT,
        env: { ...process.env, RUNS: runs, IN: stdin },
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024
      }
    );

    expect(result.status).toBe(0);
    expect(result.stdout.length).toBeGreaterThan(PIPE_BUFFER);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.result.rows).toHaveLength(ROWS);
  }, 60_000);
});
