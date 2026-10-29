import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { QUEUE_FILES, RUN_FALLBACK_SECONDS } from './agent.logic';

const read = (path: string) =>
  readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8');

// The image copies the queue files by name; a file install copies but the image lacks breaks the container
describe('agent-host image', () => {
  const dockerfile = read('../../../../../apps/agent-host/Dockerfile');
  const ignore = read('../../../../../apps/agent-host/Dockerfile.dockerignore');

  it.each(QUEUE_FILES)('copies %s', (file) => {
    expect(dockerfile).toContain(`tools/cdwr/agent-queue/${file}`);
    expect(ignore).toContain(`!/tools/cdwr/agent-queue/${file}`);
  });
});

describe('agent-host entrypoint', () => {
  const dockerfile = read('../../../../../apps/agent-host/Dockerfile');
  const entrypoint = read('../../../../../apps/agent-host/entrypoint.sh');

  it('falls back to an hourly run while the listener is live', () => {
    expect(dockerfile).toContain(
      `RUN_FALLBACK_SECONDS=${RUN_FALLBACK_SECONDS}`
    );
    expect(entrypoint).toContain(
      '(( slept >= ${RUN_FALLBACK_SECONDS:-3600} ))'
    );
    // The monitor's 10-minute schedule holds while the loop sleeps the hour
    expect(entrypoint).toMatch(/break\n {4}fi\n {4}checkin ok\n {2}done/);
  });

  it('traps the wake before the listener can send one', () => {
    expect(entrypoint.indexOf("' USR1")).toBeLessThan(
      entrypoint.indexOf('supervise_listener &')
    );
  });

  it('starts the listener only with its env, and wakes the loop itself', () => {
    expect(entrypoint).toMatch(
      /if \[\[ -n "\$\{AGENT_SUPABASE_URL:-\}" && -n "\$\{AGENT_SUPABASE_ANON_KEY:-\}" \]\]; then\n {2}supervise_listener &/
    );
    expect(entrypoint).toContain('agent listen --notify-pid "$loop_pid"');
  });

  // A wake during a run must not start a second run.sh beside it
  it('waits on run.sh until it has exited', () => {
    expect(entrypoint).toContain(
      'while kill -0 $runner 2>/dev/null; do wait $runner || true; done'
    );
    expect(entrypoint).toMatch(/trap 'pending=1;[^']*' USR1/);
  });
});
