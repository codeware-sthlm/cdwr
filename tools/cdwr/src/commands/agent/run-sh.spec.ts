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

  it('never sends a mutation', () => {
    expect(SCRIPT).not.toMatch(/mutation/i);
  });
});
