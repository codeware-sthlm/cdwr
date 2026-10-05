import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// run.sh runs gh unattended as Håkan, so every gh call must be a read
const SCRIPT = readFileSync(
  fileURLToPath(new URL('../../../agent-queue/run.sh', import.meta.url)),
  'utf8'
);

const READS = [/^gh pr list /, /^gh api graphql -f query="\$PR_QUERY" /];

describe('run.sh', () => {
  const calls = SCRIPT.split('\n')
    .filter((line) => !line.trim().startsWith('#'))
    .flatMap((line) => line.match(/\bgh\s.*/g) ?? []);

  it('calls gh', () => {
    expect(calls.length).toBeGreaterThan(0);
  });

  it.each(calls)('only reads: %s', (call) => {
    expect(READS.some((read) => read.test(call))).toBe(true);
  });

  // Tool search hides the Linear tools from a run limited by --tools
  it('runs claude without tool search', () => {
    expect(SCRIPT).toMatch(/^ENABLE_TOOL_SEARCH=false claude -p /m);
  });

  it('fails a clean run that planned nothing', () => {
    expect(SCRIPT).toMatch(/note "fail: planned nothing/);
  });

  // The runs document is the only thing run.sh writes to Linear
  it('sends no mutation but the runs document', () => {
    const mutations = [...SCRIPT.matchAll(/mutation\b[^{]*\{\s*(\w+)/gi)].map(
      ([, field]) => field
    );
    expect(mutations).toEqual(['documentCreate', 'documentUpdate']);
    expect(SCRIPT.match(/mutation/gi)).toHaveLength(2);
  });
});
