import { spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { QUEUE_FILES, RUN_FALLBACK_SECONDS } from './agent.logic';

const read = (path: string) =>
  readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8');

const hasZsh = spawnSync('zsh', ['-c', 'true']).status === 0;
const hasJq = spawnSync('jq', ['--version']).status === 0;

// The image copies the queue files by name; a file install copies but the image lacks breaks the container
describe('agent-host image', () => {
  const dockerfile = read('../../../../../apps/agent-host/Dockerfile');
  const ignore = read('../../../../../apps/agent-host/Dockerfile.dockerignore');

  it.each(QUEUE_FILES)('copies %s', (file) => {
    expect(dockerfile).toContain(`tools/cdwr/agent-queue/${file}`);
    expect(ignore).toContain(`!/tools/cdwr/agent-queue/${file}`);
  });

  it('ships the Linear proxy and tells the queue scripts its port', () => {
    expect(dockerfile).toContain('apps/agent-host/linear-mcp-proxy.mjs');
    expect(dockerfile).toMatch(
      /apps\/agent-host\/linear-mcp-proxy\.mjs\s+\/opt\/agent-host\//
    );
    expect(ignore).toContain('!/apps/agent-host/linear-mcp-proxy.mjs');
    expect(dockerfile).toContain('AGENT_QUEUE_LINEAR_PROXY_PORT=8790');
  });

  it('runs implement sessions as a second user, with two sudo crossings and nothing else', () => {
    expect(dockerfile).toMatch(/^\s+sudo \\$/m);
    expect(dockerfile).toContain('groupadd --gid 1002 queue');
    expect(dockerfile).toContain('useradd --uid 1001 --user-group');
    expect(dockerfile).toContain('usermod -aG queue agent');
    expect(dockerfile).toContain('usermod -aG queue session');
    expect(dockerfile).toContain('chmod 2770 /home/session/.claude');
    expect(dockerfile).toContain(
      'apps/agent-host/session-launch.sh apps/agent-host/session-stop.sh apps/agent-host/linear-mcp-proxy.mjs /opt/agent-host/'
    );
    expect(dockerfile).toContain(
      'COPY --chmod=440 apps/agent-host/sudoers /etc/sudoers.d/agent-host'
    );
    expect(dockerfile).toContain('visudo -cf /etc/sudoers.d/agent-host');
    expect(ignore).toContain('!/apps/agent-host/session-launch.sh');
    expect(ignore).toContain('!/apps/agent-host/sudoers');
    const sudoers = read('../../../../../apps/agent-host/sudoers');
    expect(sudoers.split('\n').filter((l) => l.includes('NOPASSWD'))).toEqual([
      'agent ALL=(session) NOPASSWD: /opt/agent-host/session-launch.sh',
      'agent ALL=(session) NOPASSWD: /opt/agent-host/session-stop.sh',
      'session ALL=(agent) NOPASSWD: /opt/agent-host/git-credential-app.sh'
    ]);
    expect(ignore).toContain('!/apps/agent-host/session-stop.sh');
    expect(dockerfile).toContain('apps/agent-host/session-stop.sh');
    expect(sudoers).toContain('env_reset');
    expect(sudoers).not.toMatch(
      /LINEAR_KEY|LINEAR_CLIENT|INFISICAL|SERVICE_KEY|SLACK|APP_KEY/
    );
    expect(sudoers).toContain('AGENT_SUPABASE_URL AGENT_SUPABASE_ANON_KEY');
    const compose = read('../../../../../apps/agent-host/compose.yaml');
    expect(compose).toContain('session-claude-home:/home/session/.claude');
    expect(compose).toContain('session-pnpm-store:/session-pnpm-store');
    expect(compose).toContain('/run/agent:mode=0700,uid=1000,gid=1000');
  });

  // The platform step reads the cms database and Fly with them
  it('installs psql and a pinned flyctl on the PATH as fly and flyctl', () => {
    expect(dockerfile).not.toMatch(/^\s+postgresql-client \\$/m);
    expect(dockerfile).toMatch(/^ARG PG_CLIENT_MAJOR=1[7-9]$/m);
    expect(dockerfile).toContain(
      'apt.postgresql.org/pub/repos/apt bookworm-pgdg'
    );
    expect(dockerfile).toContain('"postgresql-client-${PG_CLIENT_MAJOR}"');
    expect(dockerfile).toMatch(/^ARG FLYCTL_VERSION=\d+\.\d+\.\d+$/m);
    expect(dockerfile).toContain('superfly/flyctl/releases/download/');
    expect(dockerfile).toContain('/usr/local/bin flyctl');
    expect(dockerfile).toContain('ln -s flyctl /usr/local/bin/fly');
  });
});

describe('agent-host session launcher', () => {
  const launcher = read('../../../../../apps/agent-host/session-launch.sh');
  const helper = read('../../../../../apps/agent-host/git-credential-app.sh');

  it('gives the session its own home and the queue home under the other user', () => {
    expect(launcher).toContain('export HOME=/home/session');
    expect(launcher).toContain('export CDWR_HOME=/home/agent/.cdwr');
    expect(launcher).toContain(
      'export pnpm_config_store_dir=/session-pnpm-store'
    );
    expect(launcher).toContain(
      'export AGENT_QUEUE_WORKTREE_REPO=/work/codeware-session'
    );
    expect(launcher).toContain(
      'export AGENT_QUEUE_NOTIFY_SPOOL="$CDWR_HOME/agent-queue/notify-spool"'
    );
    expect(launcher).toMatch(/exec claude "\$@"\s*$/);
    expect(launcher).toContain(
      'git config --global --add safe.directory "${AGENT_QUEUE_REPO:?}"'
    );
  });

  it('gets its git tokens through the queue user, never the key', () => {
    expect(launcher).toContain(
      "'!sudo -n -u agent /opt/agent-host/git-credential-app.sh'"
    );
    expect(launcher).not.toMatch(/run\/agent|app\.pem|linear/);
    // The helper's environment is reset by sudo, so its paths are the image's
    expect(helper).toContain(
      'source /home/agent/.cdwr/agent-queue/github-app.sh'
    );
    expect(helper).not.toContain('AGENT_QUEUE_HOME');
  });
});

describe('agent-host entrypoint', () => {
  const dockerfile = read('../../../../../apps/agent-host/Dockerfile');
  const entrypoint = read('../../../../../apps/agent-host/entrypoint.sh');

  // secrets.sh writes the key secrets to the tmpfs; the entrypoint only checks the files
  it('never reads or writes the key secrets themselves', () => {
    for (const name of [
      '$AGENT_GITHUB_APP_KEY',
      '${AGENT_GITHUB_APP_KEY',
      '$AGENT_QUEUE_LINEAR_KEY"',
      '${AGENT_QUEUE_LINEAR_KEY:',
      '$AGENT_QUEUE_LINEAR_CLIENT_ID',
      '${AGENT_QUEUE_LINEAR_CLIENT_ID',
      '$AGENT_QUEUE_LINEAR_CLIENT_SECRET',
      '${AGENT_QUEUE_LINEAR_CLIENT_SECRET'
    ]) {
      expect(entrypoint).not.toContain(name);
    }
    expect(entrypoint).toContain('[[ -s "$KEY_PATH" ]]');
    expect(entrypoint).toContain(
      '[[ ! -s "$AGENT_QUEUE_LINEAR_APP_FILE" && ! -s "$AGENT_QUEUE_LINEAR_KEY_FILE" ]]'
    );
  });

  it('falls back to an hourly run while the listener is live', () => {
    expect(dockerfile).toContain(
      `RUN_FALLBACK_SECONDS=${RUN_FALLBACK_SECONDS}`
    );
    expect(entrypoint).toContain('slept >= ${RUN_FALLBACK_SECONDS:-3600} ))');
    // The monitor's 10-minute schedule holds while the loop sleeps the hour
    expect(entrypoint).toMatch(/break\n {4}fi\n {4}checkin ok\n/);
  });

  it('runs the platform step on every sleep step, never ending the loop', () => {
    // tenant_state stays fresh while the loop sleeps the hour
    expect(entrypoint).toMatch(
      /checkin ok\n(?: {4}#.*\n)* {4}"\$AGENT_QUEUE_HOME\/run\.sh" --platform \|\| true\n {2}done/
    );
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

  it('starts the Linear proxy after the queue copy, before the listener and the run loop', () => {
    const copy = entrypoint.indexOf('cp /opt/agent-queue/*');
    const proxy = entrypoint.indexOf('supervise_proxy &');
    expect(copy).toBeGreaterThan(-1);
    expect(proxy).toBeGreaterThan(copy);
    expect(proxy).toBeLessThan(entrypoint.indexOf('supervise_listener &'));
    expect(proxy).toBeLessThan(entrypoint.indexOf('while (( ! stop ))'));
    expect(entrypoint).toContain('proxy_supervisor=$!');
    expect(entrypoint).toContain('node /opt/agent-host/linear-mcp-proxy.mjs');
  });

  it('stops the proxy supervisor on TERM', () => {
    expect(entrypoint).toMatch(
      /trap '[^']*kill -TERM \$proxy_supervisor[^']*' TERM INT/
    );
  });

  // A redeploy starts ~/.claude.json empty, so every start trusts the checkout again (COD-798)
  it('trusts the checkout in ~/.claude.json before the listener and the run loop', () => {
    const trust = entrypoint.indexOf('(umask 077; trust_checkout)');
    expect(trust).toBeGreaterThan(entrypoint.indexOf('write_env\n'));
    expect(trust).toBeLessThan(entrypoint.indexOf('supervise_listener &'));
    expect(trust).toBeLessThan(entrypoint.indexOf('while (( ! stop ))'));
    expect(entrypoint).toContain(
      `'.projects[$repo].hasTrustDialogAccepted = true'`
    );
  });

  describe.skipIf(!hasZsh || !hasJq)('trust_checkout', () => {
    const fn = entrypoint.match(/^trust_checkout\(\) \{\n[\s\S]*?\n\}\n/m)?.[0];
    let home: string;

    beforeEach(() => {
      home = mkdtempSync(join(tmpdir(), 'trust-'));
    });
    afterEach(() => rmSync(home, { recursive: true, force: true }));

    const run = () =>
      spawnSync(
        'zsh',
        [
          '-c',
          `setopt err_exit pipe_fail no_unset\n${fn}\n(umask 077; trust_checkout)`
        ],
        {
          encoding: 'utf8',
          env: {
            PATH: process.env['PATH'],
            HOME: home,
            AGENT_QUEUE_REPO: '/work/repo'
          }
        }
      );
    const config = () =>
      JSON.parse(readFileSync(join(home, '.claude.json'), 'utf8'));

    it('creates the file when it is missing', () => {
      expect(fn).toBeDefined();
      expect(run().status).toBe(0);
      expect(config()).toEqual({
        projects: { '/work/repo': { hasTrustDialogAccepted: true } }
      });
      expect(statSync(join(home, '.claude.json')).mode & 0o777).toBe(0o600);
    });

    it('keeps every other key', () => {
      writeFileSync(
        join(home, '.claude.json'),
        JSON.stringify({
          userID: 'u',
          projects: {
            '/other': { hasTrustDialogAccepted: false },
            '/work/repo': { allowedTools: [] }
          }
        })
      );
      expect(run().status).toBe(0);
      expect(config()).toEqual({
        userID: 'u',
        projects: {
          '/other': { hasTrustDialogAccepted: false },
          '/work/repo': { allowedTools: [], hasTrustDialogAccepted: true }
        }
      });
    });

    it('fails without touching a broken file', () => {
      writeFileSync(join(home, '.claude.json'), '{ not json');
      expect(run().status).not.toBe(0);
      expect(readFileSync(join(home, '.claude.json'), 'utf8')).toBe(
        '{ not json'
      );
    });
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
