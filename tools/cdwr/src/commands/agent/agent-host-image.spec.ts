import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { requireTools } from '../../testing/require-tools';

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

  it('ships the GitHub token wrapper beside secrets.sh', () => {
    expect(dockerfile).toMatch(
      /apps\/agent-host\/with-gh-token\.sh[\s\S]*?\/opt\/agent-host\//
    );
    expect(ignore).toContain('!/apps/agent-host/with-gh-token.sh');
  });

  it('ships the Linear proxy and tells the queue scripts its port', () => {
    expect(dockerfile).toContain('apps/agent-host/linear-mcp-proxy.mjs');
    expect(dockerfile).toMatch(
      /apps\/agent-host\/linear-mcp-proxy\.mjs\s+\/opt\/agent-host\//
    );
    expect(ignore).toContain('!/apps/agent-host/linear-mcp-proxy.mjs');
    expect(dockerfile).toContain('AGENT_QUEUE_LINEAR_PROXY_PORT=8790');
  });

  it('runs implement sessions as a second user, with four sudo crossings (launcher, stop, git helper, devlog) and nothing else', () => {
    expect(dockerfile).toMatch(/^\s+sudo \\$/m);
    expect(dockerfile).toContain('groupadd --gid 1002 queue');
    expect(dockerfile).toContain('useradd --uid 1001 --user-group');
    expect(dockerfile).toContain('usermod -aG queue agent');
    expect(dockerfile).toContain('usermod -aG queue session');
    expect(dockerfile).toContain('chmod 2770 /home/session/.claude');
    expect(dockerfile).toContain(
      'apps/agent-host/session-launch.sh apps/agent-host/session-stop.sh apps/agent-host/devlog-cms.sh'
    );
    expect(dockerfile).toMatch(
      /COPY --chmod=755 apps\/agent-host\/secrets\.sh[^]*?devlog-cms\.sh[^]*?\/opt\/agent-host\//
    );
    expect(ignore).toContain('!/apps/agent-host/devlog-cms.sh');
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
      'session ALL=(agent) NOPASSWD: /opt/agent-host/git-credential-app.sh',
      'session ALL=(agent) NOPASSWD: /opt/agent-host/devlog-cms.sh'
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
    // Run in the background so a stop reaches it through the trap, with the transcripts shared around it
    expect(launcher).not.toMatch(/exec claude/);
    expect(launcher).toContain('claude "$@" &');
    expect(launcher).toContain(
      "trap 'kill -TERM $pid 2>/dev/null' TERM INT HUP"
    );
    expect(launcher.match(/^share_transcripts$/gm)).toHaveLength(2);
    const before = launcher.indexOf('\nshare_transcripts\n');
    expect(before).toBeGreaterThan(-1);
    expect(before).toBeLessThan(launcher.indexOf('claude "$@" &'));
    expect(launcher.lastIndexOf('\nshare_transcripts\n')).toBeGreaterThan(
      launcher.indexOf('wait $pid')
    );
    // What the session writes is readable by the queue group only
    expect(launcher).toContain('umask 027');
    // Written only when it differs: another claude may be running
    expect(launcher).toContain(
      'git config --global --get-all safe.directory 2>/dev/null | grep -qxF "${AGENT_QUEUE_REPO:?}" ||'
    );
    expect(launcher).toContain(
      'if [[ "$(git config --global --get-all credential.https://github.com.helper 2>/dev/null || true)" != $\'\\n\'"$helper" ]]; then'
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
    expect(entrypoint.match(/telemetry_env/g)).toHaveLength(3); // comment + two calls
    expect(entrypoint).toMatch(
      /\n\(\n {2}telemetry_env "\$\{AGENT_QUEUE_VAULT_FILE:-\}"\n {2}telemetry_env "\$ENV_FILE"\n {2}while true; do\n {4}exposed="\$\(exposed_credentials\)" \|\| exposed=\n {4}\[\[ -n "\$exposed" \]\] && \{ exposed_notice "\$exposed" \|\| true \}\n {4}telemetry_host_metrics "\$exposed" \|\| true\n {4}relay_sessions \|\| true\n {4}relay_notices \|\| true\n {4}sleep "\$\{HOST_METRICS_INTERVAL_SECONDS:-\$RUN_INTERVAL_SECONDS\}"\n {2}done\n\) &!\n/
    );
    // Never in the loop's own shell: it un-exports the key every run.sh needs
    expect(entrypoint).not.toMatch(/^telemetry_env/m);
    expect(entrypoint.indexOf('telemetry_host_metrics || true')).toBeLessThan(
      entrypoint.indexOf('while (( ! stop ))')
    );
  });

  it('shares /work, the queue home and the sessions dir with the session user at every start', () => {
    expect(entrypoint).toContain('chgrp queue /work && chmod 1775 /work');
    expect(entrypoint).toContain('install -d -m 755 /work/node_modules');
    expect(
      entrypoint.indexOf('install -d -m 755 /work/node_modules')
    ).toBeGreaterThan(entrypoint.indexOf('chgrp queue /work'));
    // Only what the queue user owns: a session's file would fail the chgrp and end the start
    expect(entrypoint).toContain(
      'own=("$AGENT_QUEUE_HOME" "$AGENT_QUEUE_HOME"/**/*(DNU))'
    );
    expect(entrypoint).toContain(
      'chgrp queue "${own[@]}" && chmod g+rX "${own[@]}" && chmod 750 "$AGENT_QUEUE_HOME"'
    );
    expect(entrypoint).toContain(
      'install -d -m 2770 -g queue "$AGENT_QUEUE_HOME/sessions" "$AGENT_QUEUE_HOME/notify-spool" \\\n  "$AGENT_QUEUE_HOME/devlog-drafts" "$AGENT_QUEUE_HOME/review-out"'
    );
    expect(entrypoint).toContain(
      'own=("$AGENT_QUEUE_HOME"/{sessions,notify-spool}/**/*(DNU))'
    );
    expect(entrypoint).not.toMatch(/chgrp -R|chmod -R/);
    // Before the clone and the first run, right after the queue files are copied
    expect(entrypoint.indexOf('chgrp queue /work')).toBeGreaterThan(
      entrypoint.indexOf('cp /opt/agent-queue/*')
    );
    expect(entrypoint.indexOf('chgrp queue /work')).toBeLessThan(
      entrypoint.indexOf('git clone')
    );
  });

  it('removes the ticket worktrees linked to the checkout from before the session user, once', () => {
    expect(entrypoint).toContain('for wt in /work/codeware-cod-*(N/); do');
    expect(entrypoint).toContain('== "$AGENT_QUEUE_REPO/.git" ]]; then');
    expect(entrypoint).toContain(
      'git -C "$AGENT_QUEUE_REPO" worktree remove --force "$wt" || rm -rf "$wt"'
    );
  });

  it('writes the checkout env file as mode 600', () => {
    expect(entrypoint).toMatch(/umask 077\n\s+\{\n\s+\(\( \$\{#keep\} \)\)/);
    expect(entrypoint).toContain('chmod 600 "$ENV_FILE.tmp"');
  });

  // The desk's credentials check: names in the loop's environment, never a value
  describe('exposed_credentials', () => {
    requireTools('zsh', 'jq');
    const start = entrypoint.indexOf('CREDENTIAL_NAMES=(');
    const fn = entrypoint.slice(
      start,
      entrypoint.indexOf(
        '\n}\n',
        entrypoint.indexOf('exposed_credentials() {')
      ) + 3
    );
    let dir: string;
    beforeEach(() => {
      dir = mkdtempSync(join(tmpdir(), 'exposed-'));
    });
    afterEach(() => rmSync(dir, { recursive: true, force: true }));
    const exposed = (env: Record<string, string>): string[] => {
      const r = spawnSync('zsh', ['-c', `${fn}\nexposed_credentials`], {
        encoding: 'utf8',
        env: { PATH: process.env['PATH'] ?? '', ...env }
      });
      expect(r.status).toBe(0);
      return (JSON.parse(r.stdout) as string[]).filter(
        (name) => !name.startsWith('claude as agent')
      );
    };

    it('names a listed credential and a vault key the environment holds, and nothing else', () => {
      const vault = join(dir, 'vault.env');
      writeFileSync(vault, 'CMS_URL=https://x\nOTHER_TOKEN=y\n');
      const out = exposed({
        AGENT_QUEUE_VAULT_FILE: vault,
        FLY_API_TOKEN: 'secret-fly',
        OTHER_TOKEN: 'secret-other',
        SLACK_WEBHOOK_URL: 'https://hooks/x'
      });
      expect(out.sort()).toEqual(['FLY_API_TOKEN', 'OTHER_TOKEN']);
      expect(JSON.stringify(out)).not.toContain('secret');
    });

    it('names what reads like a credential, and skips the loop own tokens and file paths', () => {
      expect(
        exposed({
          GH_TOKEN: 'secret-gh',
          SOME_DB_URL: 'postgres://secret',
          AGENT_QUEUE_LINEAR_KEY_FILE: '/run/x',
          AGENT_GITHUB_APP_KEY_PATH: '/run/y',
          CLAUDE_CODE_OAUTH_TOKEN: 'secret-oauth',
          AGENT_SUPABASE_ANON_KEY: 'anon'
        }).sort()
      ).toEqual(['GH_TOKEN', 'SOME_DB_URL']);
    });

    it('is empty for a clean environment', () => {
      expect(exposed({ SLACK_WEBHOOK_URL: 'https://hooks/x' })).toEqual([]);
    });
  });

  // The planners' memory is staged for the session, which merges it as itself
  describe('stage_memory', () => {
    requireTools('zsh');
    const fn = entrypoint.slice(
      entrypoint.indexOf('stage_memory() {'),
      entrypoint.indexOf('\n}\n', entrypoint.indexOf('stage_memory() {')) + 3
    );
    let dir: string;
    const src = () =>
      join(dir, 'a', '.claude', 'projects', '-work-x', 'memory');
    const stage = () => join(dir, 'q', 'memory-from-agent');
    const mode = (path: string) => statSync(path).mode & 0o777;
    // install -g and chgrp need the queue group: a stub keeps the mode and skips the group
    const stub = () => {
      const bin = join(dir, 'bin');
      mkdirSync(bin);
      writeFileSync(
        join(bin, 'install'),
        '#!/bin/sh\nwhile [ $# -gt 0 ]; do case "$1" in -d) ;; -m) m=$2; shift;; -g) shift;; *) d=$1;; esac; shift; done\nmkdir -p "$d" && chmod "$m" "$d"\n',
        { mode: 0o755 }
      );
      writeFileSync(join(bin, 'chgrp'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
      return bin;
    };
    const run = () =>
      spawnSync(
        'zsh',
        ['-c', `setopt err_exit pipe_fail no_unset\n${fn}\nstage_memory`],
        {
          encoding: 'utf8',
          env: {
            PATH: `${stub()}:${process.env['PATH'] ?? ''}`,
            HOME: join(dir, 'a'),
            AGENT_QUEUE_HOME: join(dir, 'q'),
            AGENT_QUEUE_REPO: '/work/x'
          }
        }
      );
    beforeEach(() => {
      dir = mkdtempSync(join(tmpdir(), 'stage-memory-'));
      mkdirSync(join(dir, 'q'));
    });
    afterEach(() => rmSync(dir, { recursive: true, force: true }));

    it('copies the markdown files with their times kept, as mode 640', () => {
      mkdirSync(src(), { recursive: true });
      writeFileSync(join(src(), 'MEMORY.md'), '- [A](a.md)\n');
      writeFileSync(join(src(), 'a.md'), 'a\n');
      writeFileSync(join(src(), 'notes.txt'), 'not memory\n');
      utimesSync(join(src(), 'a.md'), 1e9, 1e9);
      expect(run().status).toBe(0);
      expect(readdirSync(stage()).sort()).toEqual(['MEMORY.md', 'a.md']);
      expect(statSync(join(stage(), 'a.md')).mtimeMs).toBe(1e12);
      expect(mode(join(stage(), 'a.md'))).toBe(0o640);
      expect(mode(join(stage(), 'MEMORY.md'))).toBe(0o640);
      expect(mode(stage())).toBe(0o750);
    });

    it('stages nothing without a memory, and removes an old stage', () => {
      mkdirSync(stage());
      writeFileSync(join(stage(), 'old.md'), 'old\n');
      expect(run().status).toBe(0);
      expect(existsSync(stage())).toBe(false);
    });

    it('creates the stage for the queue group, as mode 750', () => {
      expect(entrypoint).toContain('install -d -m 750 -g queue "$stage"');
      expect(entrypoint).toContain(
        'chgrp queue "$stage"/*(N) && chmod 640 "$stage"/*(N)'
      );
    });
  });

  // The session merges the staged planners' memory into its own, as itself
  describe('merge_memory', () => {
    requireTools('zsh');
    const launcher = read('../../../../../apps/agent-host/session-launch.sh');
    const fn = launcher.slice(
      launcher.indexOf('merge_memory() {'),
      launcher.indexOf('\n}\n', launcher.indexOf('merge_memory() {')) + 3
    );
    let dir: string;
    const stage = () => join(dir, 'cdwr', 'agent-queue', 'memory-from-agent');
    const mem = () =>
      join(dir, 'home', '.claude', 'projects', '-work-x', 'memory');
    const putStage = (name: string, text: string, old = false) => {
      mkdirSync(stage(), { recursive: true });
      writeFileSync(join(stage(), name), text);
      if (old) utimesSync(join(stage(), name), 1e9, 1e9);
    };
    const putOwn = (name: string, text: string, old = false) => {
      mkdirSync(mem(), { recursive: true });
      writeFileSync(join(mem(), name), text);
      if (old) utimesSync(join(mem(), name), 1e9, 1e9);
    };
    const own = (name: string) => readFileSync(join(mem(), name), 'utf8');
    const mode = (name: string) => statSync(join(mem(), name)).mode & 0o777;
    const merge = () =>
      spawnSync(
        'zsh',
        ['-c', `setopt err_exit pipe_fail no_unset\n${fn}\n( merge_memory )`],
        {
          encoding: 'utf8',
          env: {
            PATH: process.env['PATH'] ?? '',
            HOME: join(dir, 'home'),
            CDWR_HOME: join(dir, 'cdwr'),
            AGENT_QUEUE_REPO: '/work/x'
          }
        }
      );
    beforeEach(() => {
      dir = mkdtempSync(join(tmpdir(), 'merge-memory-'));
    });
    afterEach(() => rmSync(dir, { recursive: true, force: true }));

    it('copies what the session lacks, keeps its newer files and adds the missing index lines, once', () => {
      putStage('MEMORY.md', '- [A](a.md) — a\n- [T](taste.md) — t\n');
      putStage('taste.md', 'taste\n');
      putStage('a.md', 'agent\n', true);
      putOwn('a.md', 'session\n');
      putOwn('MEMORY.md', '- [A](a.md) — a\n- [I](impl.md) — i\n');
      expect(merge().status).toBe(0);
      expect(merge().status).toBe(0);
      expect(own('taste.md')).toBe('taste\n');
      expect(own('a.md')).toBe('session\n');
      expect(own('MEMORY.md')).toBe(
        '- [A](a.md) — a\n- [I](impl.md) — i\n- [T](taste.md) — t\n'
      );
      expect(mode('taste.md')).toBe(0o640);
      expect(mode('MEMORY.md')).toBe(0o640);
      expect(readdirSync(mem()).filter((f) => f.startsWith('.merge'))).toEqual(
        []
      );
    });

    it('replaces an older session copy', () => {
      putOwn('taste.md', 'old\n', true);
      putStage('taste.md', 'new\n');
      expect(merge().status).toBe(0);
      expect(own('taste.md')).toBe('new\n');
      expect(mode('taste.md')).toBe(0o640);
    });

    it('does nothing without a stage', () => {
      expect(merge().status).toBe(0);
      expect(existsSync(join(mem(), 'MEMORY.md'))).toBe(false);
    });
  });

  it('relays the session rows and the spooled notices from the sampler, as the queue user', () => {
    expect(entrypoint).toContain(
      'telemetry_session "$id" implement "$state" "$detail" strict; then'
    );
    expect(entrypoint).toContain('stamp="$file.relayed"');
    // Stamped with the time before the read, so a change during the send is relayed next time,
    // and only once the row is sent; a mirrored file from another host is that host's to send
    expect(entrypoint.indexOf('touch -r "$file" "$stamp.new"')).toBeLessThan(
      entrypoint.indexOf('telemetry_session "$id" implement')
    );
    expect(entrypoint).toMatch(
      /"\$detail" strict; then\n\s+mv -f "\$stamp\.new" "\$stamp"\n\s+else\n\s+rm -f "\$stamp\.new"/
    );
    expect(entrypoint).toContain(
      '[[ -n "$host" && "$host" != "$(hostname -s)" ]]'
    );
    expect(entrypoint).toContain(
      'for file in "$AGENT_QUEUE_HOME"/notify-spool/*.json(N); do'
    );
    // A notice is removed only once it posted, or when it is not a notice at all
    expect(entrypoint).toMatch(
      /--data @- "\$url" >\/dev\/null 2>&1; then\n\s+rm -f "\$file"/
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

  describe('trust_checkout', () => {
    requireTools('zsh', 'jq');

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
