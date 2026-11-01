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
    expect(entrypoint).toContain('slept >= ${RUN_FALLBACK_SECONDS:-3600} ))');
    // The monitor's 10-minute schedule holds while the loop sleeps the hour
    expect(entrypoint).toMatch(/break\n {4}fi\n {4}checkin ok\n {2}done/);
  });

  it('samples the host from one disowned sampler, with telemetry_env inside it', () => {
    // The desk's NUC heartbeat: three missed samples read as silent
    expect(dockerfile).toContain('HOST_METRICS_INTERVAL_SECONDS=60');
    expect(entrypoint.match(/telemetry_host_metrics/g)).toHaveLength(1);
    expect(entrypoint.match(/telemetry_env/g)).toHaveLength(2); // comment + call
    expect(entrypoint).toMatch(
      /\n\(\n {2}telemetry_env "\$ENV_FILE"\n {2}while true; do\n {4}telemetry_host_metrics \|\| true\n {4}sleep "\$\{HOST_METRICS_INTERVAL_SECONDS:-\$RUN_INTERVAL_SECONDS\}"\n {2}done\n\) &!\n/
    );
    // Never in the loop's own shell: it un-exports the key every run.sh needs
    expect(entrypoint).not.toMatch(/^telemetry_env/m);
    expect(entrypoint.indexOf('telemetry_host_metrics || true')).toBeLessThan(
      entrypoint.indexOf('while (( ! stop ))')
    );
  });

  it('traps the wake before the listener can send one', () => {
    expect(entrypoint.indexOf("' USR1")).toBeLessThan(
      entrypoint.indexOf('supervise_listener &')
    );
  });

  it('records the loop pid for `cdwr agent run`, after the wake is trapped', () => {
    const write = 'print -r -- "$loop_pid" > "$AGENT_QUEUE_HOME/loop.pid"';
    expect(entrypoint).toContain(`loop_pid=$$\n`);
    expect(entrypoint).toContain(write);
    expect(entrypoint.indexOf("' USR1")).toBeLessThan(
      entrypoint.indexOf(write)
    );
    expect(entrypoint.indexOf('loop_pid=$$')).toBeLessThan(
      entrypoint.indexOf(write)
    );
  });

  it('starts the listener only with its env, and wakes the loop itself', () => {
    expect(entrypoint).toMatch(
      /if \[\[ -n "\$\{AGENT_SUPABASE_URL:-\}" && -n "\$\{AGENT_SUPABASE_ANON_KEY:-\}" \]\]; then\n {2}supervise_listener &/
    );
    expect(entrypoint).toContain('agent listen --notify-pid "$loop_pid"');
  });

  it('brings the checkout the listener runs from to origin/main at start', () => {
    expect(
      entrypoint.indexOf('git switch -q --detach origin/main')
    ).toBeLessThan(entrypoint.indexOf('supervise_listener &'));
  });

  it('sends no heartbeat after a failed run', () => {
    expect(entrypoint).toContain('(( st != 0 || slept >=');
  });

  // A wake during a run must not start a second run.sh beside it
  it('waits on run.sh until it has exited', () => {
    expect(entrypoint).toContain(
      'while kill -0 $runner 2>/dev/null; do st=0; wait $runner || st=$?; done'
    );
    expect(entrypoint).toMatch(/trap 'pending=1;[^']*' USR1/);
  });
});
