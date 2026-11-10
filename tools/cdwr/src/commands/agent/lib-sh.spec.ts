import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const LIB = fileURLToPath(
  new URL('../../../agent-queue/lib.sh', import.meta.url)
);
const SCRIPT = readFileSync(LIB, 'utf8');
const REAL_LIB = realpathSync(LIB);
const hasZsh = spawnSync('zsh', ['-c', 'true']).status === 0;

describe('lib.sh', () => {
  it('keeps the credentials out of the curl command line', () => {
    expect(SCRIPT).not.toContain('-H "Authorization:');
    expect(SCRIPT).not.toContain('-d "client_secret=');
    expect(SCRIPT).not.toContain('-d client_secret=');
    expect(SCRIPT).not.toContain('--data "client_secret');
    expect(SCRIPT).toContain('-H @<(print -r -- "Authorization: $auth")');
    expect(SCRIPT).toContain('-H @<(print -r -- "Authorization: $header")');
    expect(SCRIPT).toContain(
      '--data-urlencode client_id@<(print -rn -- "$LINEAR_CLIENT_ID")'
    );
    expect(SCRIPT).toContain(
      '--data-urlencode client_secret@<(print -rn -- "$LINEAR_CLIENT_SECRET")'
    );
  });

  describe.skipIf(!hasZsh)('Linear MCP', () => {
    let dir: string;

    beforeEach(() => {
      dir = mkdtempSync(join(tmpdir(), 'lib-sh-'));
      // The Keychain fallback is Darwin-only: pretend to be Linux
      mkdirSync(join(dir, 'bin'));
      writeFileSync(join(dir, 'bin', 'uname'), '#!/bin/sh\necho Linux\n');
      chmodSync(join(dir, 'bin', 'uname'), 0o755);
      keyFile = join(dir, 'k.key');
      writeFileSync(keyFile, 'k\n');
    });

    afterEach(() => {
      rmSync(dir, { recursive: true, force: true });
    });

    const bin = (): string => join(dir, 'bin');
    let keyFile: string;

    const run = (script: string, env: Record<string, string> = {}) =>
      spawnSync('zsh', ['-c', `source "${LIB}"\n${script}`], {
        encoding: 'utf8',
        env: {
          PATH: `${join(dir, 'bin')}:${process.env['PATH'] ?? ''}`,
          HOME: dir,
          ...env
        }
      });

    it.each([
      ['key by default', {}, 'key'],
      ['key on the container host', { AGENT_QUEUE_HOST: 'container' }, 'key'],
      [
        'the explicit mode over the host',
        { AGENT_QUEUE_HOST: 'container', AGENT_QUEUE_LINEAR_MCP: 'connector' },
        'connector'
      ],
      [
        'the explicit mode on a plain host',
        { AGENT_QUEUE_LINEAR_MCP: 'key' },
        'key'
      ]
    ])('picks %s', (_name, env, mode) => {
      expect(run('print -r -- "$LINEAR_MCP"', env).stdout.trim()).toBe(mode);
    });

    it('connector: prefixes the claude.ai tools and adds no flags', () => {
      const out = run(
        `linear_mcp "${dir}"; print -r -- "$L|\${#LINEAR_MCP_ARGS[@]}"`,
        {
          AGENT_QUEUE_LINEAR_MCP: 'connector',
          AGENT_QUEUE_LINEAR_KEY: 'sekret'
        }
      ).stdout.trim();
      expect(out).toBe('mcp__claude_ai_Linear|0');
    });

    // The key reaches neither argv, the config nor claude's environment
    it('key: prefixes its own server and writes a config that holds only the helper', () => {
      const out = run(
        `linear_mcp "${dir}"; print -r -- "$L"; print -r -- "\${LINEAR_MCP_ARGS[*]}"`,
        { AGENT_QUEUE_LINEAR_MCP: 'key', AGENT_QUEUE_LINEAR_KEY: 'sekret' }
      ).stdout.split('\n');
      expect(out[0]).toBe('mcp__agent_linear');
      expect(out[1]).toBe(
        `--strict-mcp-config --mcp-config ${dir}/linear-mcp.json`
      );
      const raw = readFileSync(join(dir, 'linear-mcp.json'), 'utf8');
      const server = (
        JSON.parse(raw) as {
          mcpServers: { agent_linear: Record<string, string> };
        }
      ).mcpServers.agent_linear;
      expect(server['headersHelper']).toBe(`zsh ${REAL_LIB} header`);
      expect(server).not.toHaveProperty('headers');
      expect(raw).not.toContain('sekret');
    });

    describe('key sources', () => {
      const keyFile = (value: string): string => {
        const file = join(dir, 'linear.key');
        writeFileSync(file, `${value}\n`);
        return file;
      };
      const header = (env: Record<string, string>) =>
        spawnSync('zsh', [LIB, 'header'], {
          encoding: 'utf8',
          env: {
            PATH: `${join(dir, 'bin')}:${process.env['PATH'] ?? ''}`,
            HOME: dir,
            ...env
          }
        });

      it('reads the key from the file', () => {
        expect(
          run('print -r -- "$key"', {
            AGENT_QUEUE_LINEAR_KEY_FILE: keyFile('fromfile')
          }).stdout.trim()
        ).toBe('fromfile');
      });

      it('prefers the environment over the file', () => {
        expect(
          run('print -r -- "$key"', {
            AGENT_QUEUE_LINEAR_KEY: 'fromenv',
            AGENT_QUEUE_LINEAR_KEY_FILE: keyFile('fromfile')
          }).stdout.trim()
        ).toBe('fromenv');
      });

      it('header: prints the authorization JSON from the file', () => {
        const result = header({ AGENT_QUEUE_LINEAR_KEY_FILE: keyFile('k') });
        expect(result.status).toBe(0);
        expect(result.stdout.trim()).toBe('{"Authorization":"Bearer k"}');
      });

      it('header: prints nothing and fails without a key', () => {
        const result = header({});
        expect(result.status).not.toBe(0);
        expect(result.stdout).toBe('');
      });

      it('prints no header when sourced', () => {
        const result = spawnSync(
          'zsh',
          ['-c', `source "${LIB}" header; print done`],
          {
            encoding: 'utf8',
            env: {
              PATH: `${join(dir, 'bin')}:${process.env['PATH'] ?? ''}`,
              HOME: dir,
              AGENT_QUEUE_LINEAR_KEY: 'k'
            }
          }
        );
        expect(result.stdout.trim()).toBe('done');
      });
    });

    it('names an unknown mode', () => {
      expect(
        run('linear_tools', { AGENT_QUEUE_LINEAR_MCP: 'x' }).stdout.trim()
      ).toBe('unknown AGENT_QUEUE_LINEAR_MCP=x');
    });

    it('key: says so without a key', () => {
      expect(
        run('linear_tools', {
          AGENT_QUEUE_LINEAR_MCP: 'key',
          AGENT_QUEUE_LINEAR_KEY: ''
        }).stdout.trim()
      ).toBe('key: no Linear credentials for the header helper');
    });

    // claude runs without the env key, so the helper cannot use it either
    it('key: an environment key alone does not count', () => {
      expect(
        run('linear_tools', {
          AGENT_QUEUE_LINEAR_MCP: 'key',
          AGENT_QUEUE_LINEAR_KEY: 'k'
        }).stdout.trim()
      ).toBe('key: no Linear credentials for the header helper');
    });

    it('key: environment client credentials alone do not count either', () => {
      expect(
        run('linear_tools', {
          AGENT_QUEUE_LINEAR_MCP: 'key',
          AGENT_QUEUE_LINEAR_CLIENT_ID: 'id',
          AGENT_QUEUE_LINEAR_CLIENT_SECRET: 'sekret'
        }).stdout.trim()
      ).toBe('key: no Linear credentials for the header helper');
    });

    // The helper runs under claude_env, without the key variables: it signs with the token cache
    const cachedToken = (token: string): Record<string, string> => {
      writeFileSync(
        join(dir, 'linear.token'),
        JSON.stringify({
          token,
          expiresAt: Math.floor(Date.now() / 1000) + 2_000_000
        })
      );
      return { AGENT_QUEUE_HOME: dir };
    };

    // Under errexit, as the scripts run: a curl that fails is a reason, not an exit
    it('key: names a failed request', () => {
      writeFileSync(join(dir, 'bin', 'curl'), '#!/bin/sh\nexit 28\n');
      chmodSync(join(dir, 'bin', 'curl'), 0o755);
      const result = run(
        'set -euo pipefail; why="$(linear_tools)"; print -r -- "after: $why"',
        { AGENT_QUEUE_LINEAR_MCP: 'key', ...cachedToken('k') }
      );
      expect(result.status).toBe(0);
      expect(result.stdout.trim()).toBe(
        "after: key: Linear's MCP answered nothing"
      );
    });

    it('key: refuses a 200 that carries no initialize result', () => {
      writeFileSync(
        join(dir, 'bin', 'curl'),
        `#!/bin/sh\nprintf '%s\\n200' 'data: {"jsonrpc":"2.0","id":1,"error":{"code":-32000}}'\n`
      );
      chmodSync(join(dir, 'bin', 'curl'), 0o755);
      expect(
        run('linear_tools', {
          AGENT_QUEUE_LINEAR_MCP: 'key',
          ...cachedToken('k')
        }).stdout.trim()
      ).toBe("key: Linear's MCP refused initialize");
    });

    it('key: sends the header from the token cache to Linear', () => {
      const seen = join(dir, 'seen');
      writeFileSync(
        join(bin(), 'curl'),
        `#!/bin/sh\nwhile [ $# -gt 0 ]; do case "$1" in -H) case "$2" in @*) cat "\${2#@}" >> "${seen}";; esac;; esac; shift; done\nprintf '%s\\n200' 'data: {"result":{}}'\n`
      );
      chmodSync(join(bin(), 'curl'), 0o755);
      run('linear_tools', {
        AGENT_QUEUE_LINEAR_MCP: 'key',
        ...cachedToken('k')
      });
      expect(readFileSync(seen, 'utf8').trim()).toBe('Authorization: Bearer k');
    });

    it('gate: marks a spell once and clears it when Linear is back', () => {
      const gate = (cmd: string) =>
        run(
          `if linear_gate "${dir}"; then print ok; else print -r -- "$linear_why|$linear_new"; fi`,
          { AGENT_QUEUE_LINEAR_TOOLS_CMD: cmd }
        ).stdout.trim();
      expect(gate('print -r -- gone')).toBe('gone|true');
      expect(gate('print -r -- gone')).toBe('gone|false');
      expect(gate('true')).toBe('ok');
      expect(gate('print -r -- gone')).toBe('gone|true');
    });

    it('lets the override command replace the check', () => {
      expect(
        run('linear_tools', {
          AGENT_QUEUE_LINEAR_MCP: 'x',
          AGENT_QUEUE_LINEAR_TOOLS_CMD: 'print -r -- custom'
        }).stdout.trim()
      ).toBe('custom');
    });

    describe('the app token', () => {
      const creds = {
        AGENT_QUEUE_LINEAR_CLIENT_ID: 'id',
        AGENT_QUEUE_LINEAR_CLIENT_SECRET: 'sekret'
      };
      const now = (): number => Math.floor(Date.now() / 1000);
      const tokenFile = (): string => join(dir, 'linear.token');
      const cache = (token: string, expiresAt: number): void =>
        writeFileSync(tokenFile(), JSON.stringify({ token, expiresAt }));
      const readCache = (): { token: string; expiresAt: number } =>
        JSON.parse(readFileSync(tokenFile(), 'utf8'));
      const seen = (name: string): string =>
        readFileSync(join(dir, name), 'utf8');

      const runApp = (script: string, env: Record<string, string> = {}) =>
        run(script, {
          AGENT_QUEUE_LINEAR_TOKEN_FILE: tokenFile(),
          AGENT_QUEUE_HOME: dir,
          ...env
        });

      beforeEach(() => {
        const fake = [
          '#!/bin/sh',
          `d="${dir}"`,
          'printf \'%s\\n\' "$@" >> "$d/argv"',
          'url= out= lasth=',
          'while [ $# -gt 0 ]; do',
          '  case "$1" in',
          '    http*) url="$1" ;;',
          '    -o) out="$2"; shift ;;',
          '    -d) case "$2" in @*) cat "${2#@}" >> "$d/seen-token"; echo >> "$d/seen-token" ;; esac; shift ;;',
          '    --data-urlencode) case "$2" in *@*) printf \'%s=%s\\n\' "${2%%@*}" "$(cat "${2#*@}")" >> "$d/seen-token" ;; esac; shift ;;',
          '    -H) case "$2" in @*) lasth="$(cat "${2#@}")"; printf \'%s\\n\' "$lasth" >> "$d/seen-headers" ;; esac; shift ;;',
          '    --data) cat > /dev/null; shift ;;',
          '  esac',
          '  shift',
          'done',
          'case "$url" in',
          '  *oauth/token)',
          '    n=$(cat "$d/exchanges" 2>/dev/null || echo 0); n=$((n + 1)); echo "$n" > "$d/exchanges"',
          '    printf \'{"access_token":"tok%s","token_type":"Bearer","expires_in":2592000}\' "$n" ;;',
          '  *mcp.linear.app*)',
          '    if [ -e "$d/mcp-401-once" ]; then rm -f "$d/mcp-401-once"; printf \'\\n401\'',
          '    else printf \'data: {"result":{"protocolVersion":"x"}}\\n200\'; fi ;;',
          '  *)',
          '    case "$lasth" in',
          '      *"Bearer bogus")',
          '        printf \'%s\\n401\' \'{"errors":[{"message":"Authentication required, not authenticated","extensions":{"code":"AUTHENTICATION_ERROR","statusCode":401}}]}\' ;;',
          '      *) printf \'%s\\n200\' \'{"data":{"viewer":{"id":"u"}}}\' ;;',
          '    esac ;;',
          'esac',
          ''
        ].join('\n');
        writeFileSync(join(bin(), 'curl'), fake);
        chmodSync(join(bin(), 'curl'), 0o755);
      });

      it('buys a token with env credentials and caches it at mode 600', () => {
        const result = runApp('linear_token', creds);
        expect(result.stdout.trim()).toBe('tok1');
        expect(statSync(tokenFile()).mode & 0o777).toBe(0o600);
        const cached = readCache();
        expect(cached.token).toBe('tok1');
        expect(Math.abs(cached.expiresAt - (now() + 2592000))).toBeLessThan(60);
        expect(seen('seen-token')).toContain('client_id=id');
        expect(seen('seen-token')).toContain('client_secret=sekret');
        expect(seen('argv')).not.toContain('sekret');
      });

      it('reuses the cache within one run', () => {
        const result = runApp('linear_token; linear_token', creds);
        expect(result.stdout.trim().split('\n')).toEqual(['tok1', 'tok1']);
        expect(seen('exchanges').trim()).toBe('1');
      });

      it('buys again when the cache has less than a day left', () => {
        cache('stale', now() + 3600);
        expect(runApp('linear_token', creds).stdout.trim()).toBe('tok1');
        expect(seen('exchanges').trim()).toBe('1');
        expect(readCache().token).toBe('tok1');
      });

      it('force skips a fresh cache', () => {
        cache('cached', now() + 2000000);
        expect(runApp('linear_token force', creds).stdout.trim()).toBe('tok1');
      });

      it('falls back to the key without credentials', () => {
        const result = runApp('linear_token', {
          AGENT_QUEUE_LINEAR_KEY_FILE: keyFile
        });
        expect(result.stdout.trim()).toBe('k');
        expect(existsSync(join(dir, 'exchanges'))).toBe(false);
      });

      // Linear's GraphQL refuses a personal key behind a Bearer prefix
      it('linear: sends the personal key bare, and a ticket text naming the auth error is no refusal', () => {
        const file = join(dir, 'linear.key');
        writeFileSync(file, 'k\n');
        const result = runApp(
          'linear \'{ viewer { id } }\'; print -r -- "exchanges: $(cat "$AGENT_QUEUE_HOME/exchanges" 2>/dev/null || echo none)"',
          { AGENT_QUEUE_LINEAR_KEY_FILE: file }
        );
        expect(result.stdout.trim().split('\n')).toEqual([
          '{"data":{"viewer":{"id":"u"}}}',
          'exchanges: none'
        ]);
        const headers = readFileSync(join(dir, 'seen-headers'), 'utf8');
        expect(headers).toContain('Authorization: k');
        expect(headers).not.toContain('Bearer k');
      });

      it('fails with nothing printed when nothing can sign', () => {
        expect(runApp('linear_token; print -r -- "rc=$?"').stdout).toBe(
          'rc=1\n'
        );
        const auth = (env: Record<string, string>): string =>
          runApp('linear_auth && print yes || print no', env).stdout.trim();
        expect(auth({})).toBe('no');
        expect(auth({ AGENT_QUEUE_LINEAR_KEY_FILE: keyFile })).toBe('yes');
        expect(auth(creds)).toBe('yes');
      });

      it('reads the credentials from the app file', () => {
        const file = join(dir, 'linear-app.env');
        writeFileSync(
          file,
          'AGENT_QUEUE_LINEAR_CLIENT_ID=fid\nAGENT_QUEUE_LINEAR_CLIENT_SECRET=fsec\n'
        );
        expect(
          runApp('linear_token', {
            AGENT_QUEUE_LINEAR_APP_FILE: file
          }).stdout.trim()
        ).toBe('tok1');
        expect(seen('seen-token')).toContain('client_id=fid');
        expect(seen('seen-token')).toContain('client_secret=fsec');
      });

      it('linear: buys a new token when Linear refuses the cached one', () => {
        cache('bogus', now() + 2000000);
        const result = runApp("linear '{ viewer { id } }'", creds);
        expect(result.stdout.trim()).toBe('{"data":{"viewer":{"id":"u"}}}');
        expect(seen('exchanges').trim()).toBe('1');
        expect(readCache().token).toBe('tok1');
      });

      it('linear: fails with nothing printed when curl does', () => {
        writeFileSync(join(bin(), 'curl'), '#!/bin/sh\nexit 28\n');
        const result = runApp(
          'linear \'{ viewer { id } }\'; print -r -- "rc=$?"',
          {
            AGENT_QUEUE_LINEAR_KEY_FILE: keyFile
          }
        );
        expect(result.stdout).toBe('rc=1\n');
      });

      it('header: prints the token as the helper does, with and without credentials', () => {
        const direct = spawnSync('zsh', [LIB, 'header'], {
          encoding: 'utf8',
          env: {
            PATH: `${bin()}:${process.env['PATH'] ?? ''}`,
            HOME: dir,
            AGENT_QUEUE_LINEAR_TOKEN_FILE: tokenFile(),
            AGENT_QUEUE_HOME: dir,
            ...creds
          }
        });
        expect(direct.stdout.trim()).toBe('{"Authorization":"Bearer tok1"}');
        cache('cached', now() + 2000000);
        const stripped = runApp(
          '"${claude_env[@]}" sh -c "$LINEAR_HEADERS_HELPER"',
          creds
        );
        expect(stripped.stdout.trim()).toBe(
          '{"Authorization":"Bearer cached"}'
        );
      });

      it('claude_env strips the key and the client credentials', () => {
        const result = runApp(
          `"\${claude_env[@]}" sh -c 'echo "\${AGENT_QUEUE_LINEAR_KEY:-u}|\${AGENT_QUEUE_LINEAR_CLIENT_ID:-u}|\${AGENT_QUEUE_LINEAR_CLIENT_SECRET:-u}|\${AGENT_QUEUE_LINEAR_KEY_FILE:-u}|\${AGENT_QUEUE_LINEAR_APP_FILE:-u}|\${AGENT_QUEUE_LINEAR_TOKEN_FILE:-u}"'`,
          {
            ...creds,
            AGENT_QUEUE_LINEAR_KEY: 'k',
            AGENT_QUEUE_LINEAR_KEY_FILE: 'f',
            AGENT_QUEUE_LINEAR_APP_FILE: 'g'
          }
        );
        expect(result.stdout.trim()).toBe('u|u|u|u|u|u');
      });

      it('in the container the credential files have their fixed places without the variables', () => {
        const result = run(
          'print -r -- "$LINEAR_TOKEN_FILE|${AGENT_QUEUE_LINEAR_KEY_FILE}|${AGENT_QUEUE_LINEAR_APP_FILE}"',
          { AGENT_QUEUE_HOST: 'container' }
        );
        expect(result.stdout.trim()).toBe(
          '/run/agent/linear.token|/run/agent/linear.key|/run/agent/linear-app.env'
        );
      });

      it('linear_tools: a refused MCP token is bought again once', () => {
        cache('bogus', now() + 2000000);
        writeFileSync(join(dir, 'mcp-401-once'), '');
        const result = runApp('linear_tools', {
          ...creds,
          AGENT_QUEUE_LINEAR_MCP: 'key'
        });
        expect(result.stdout).toBe('');
        expect(seen('exchanges').trim()).toBe('1');
      });
    });
  });

  describe.skipIf(!hasZsh)('the scheduler elsewhere', () => {
    let dir: string;

    beforeEach(() => {
      dir = mkdtempSync(join(tmpdir(), 'lib-sh-'));
      mkdirSync(join(dir, 'bin'));
      writeFileSync(join(dir, 'bin', 'uname'), '#!/bin/sh\necho Linux\n');
      chmodSync(join(dir, 'bin', 'uname'), 0o755);
    });

    afterEach(() => {
      rmSync(dir, { recursive: true, force: true });
    });

    const stub = (name: string, body: string) => {
      writeFileSync(join(dir, 'bin', name), `#!/bin/sh\n${body}\n`);
      chmodSync(join(dir, 'bin', name), 0o755);
    };

    const run = (script: string, env: Record<string, string> = {}) =>
      spawnSync('zsh', ['-c', `source "${LIB}"\n${script}`], {
        encoding: 'utf8',
        env: {
          PATH: `${join(dir, 'bin')}:${process.env['PATH'] ?? ''}`,
          HOME: dir,
          ...env
        }
      });

    const here = (env: Record<string, string> = {}) =>
      run('scheduler_here && print yes || print no', env).stdout.trim();

    describe('scheduler_here', () => {
      it('is true on the container host', () => {
        stub('launchctl', 'exit 1');
        expect(here({ AGENT_QUEUE_HOST: 'container' })).toBe('yes');
      });

      it('is true when the plist exists', () => {
        stub('launchctl', 'exit 1');
        const agents = join(dir, 'Library', 'LaunchAgents');
        mkdirSync(agents, { recursive: true });
        writeFileSync(join(agents, 'se.codeware.agent-queue.plist'), '');
        expect(here()).toBe('yes');
      });

      it('is true when launchctl knows the job', () => {
        stub('launchctl', 'exit 0');
        expect(here()).toBe('yes');
      });

      it('is false when nothing holds', () => {
        stub('launchctl', 'exit 1');
        expect(here()).toBe('no');
      });
    });

    describe('remote_watch', () => {
      const row =
        '[{"host":"nuc","at":"2026-11-05T00:00:00Z","watch":{"COD-1":{"pr":12,"state":"open","unresolved":1}}}]';

      const fake = (json: string, seen: string) =>
        `supabase_select() { print -r -- "$2" > "${seen}"; print -r -- '${json}' }\nremote_watch`;

      it('prints the freshest other host row with its watch', () => {
        const seen = join(dir, 'query');
        const out = run(fake(row, seen)).stdout.trim();
        expect(JSON.parse(out)).toEqual({
          host: 'nuc',
          at: '2026-11-05T00:00:00Z',
          watch: { 'COD-1': { pr: 12, state: 'open', unresolved: 1 } }
        });
        const query = readFileSync(seen, 'utf8');
        expect(query).toContain('watch=not.is.null');
        expect(query).toContain('order=at.desc');
        expect(query).toContain('limit=1');
        expect(query).toContain('host=neq.');
      });

      it.each([
        ['no rows', '[]'],
        ['a null watch', '[{"host":"mac","at":"x","watch":null}]']
      ])('prints nothing for %s', (_name, json) => {
        const out = run(fake(json, join(dir, 'query')));
        expect(out.stdout.trim()).toBe('');
        expect(out.status).toBe(0);
      });

      it('includes the renovate state when the row has it', () => {
        const withRenovate =
          '[{"host":"nuc","at":"2026-11-05T00:00:00Z","watch":{},"renovate":{"754":{"pr":754,"state":"failing"}}}]';
        const seen = join(dir, 'query');
        const out = run(fake(withRenovate, seen)).stdout.trim();
        expect(JSON.parse(out)).toEqual({
          host: 'nuc',
          at: '2026-11-05T00:00:00Z',
          watch: {},
          renovate: { '754': { pr: 754, state: 'failing' } }
        });
        expect(readFileSync(seen, 'utf8')).toContain(
          'select=host,at,watch,renovate&'
        );
      });

      it('omits renovate when the row has none', () => {
        const out = run(fake(row, join(dir, 'query'))).stdout.trim();
        expect(JSON.parse(out)).not.toHaveProperty('renovate');
      });

      // Before the renovate column exists the first select fails and prints nothing
      it('falls back to the select without renovate when the first prints nothing', () => {
        const log = join(dir, 'queries');
        const out = run(
          `supabase_select() {\n  print -r -- "$2" >> "${log}"\n  [[ "$2" == *renovate* ]] && return 0\n  print -r -- '${row}'\n}\nremote_watch`
        ).stdout.trim();
        expect(JSON.parse(out)).toEqual({
          host: 'nuc',
          at: '2026-11-05T00:00:00Z',
          watch: { 'COD-1': { pr: 12, state: 'open', unresolved: 1 } }
        });
        const queries = readFileSync(log, 'utf8').trim().split('\n');
        expect(queries).toHaveLength(2);
        expect(queries[0]).toContain('select=host,at,watch,renovate&');
        expect(queries[1]).toContain('select=host,at,watch&');
      });

      it('prints nothing without supabase_select', () => {
        const out = run('remote_watch; print -r -- "rc=$?"');
        expect(out.stdout.trim()).toBe('rc=0');
      });

      it('url-encodes the host in the filter', () => {
        const seen = join(dir, 'query');
        run(`host_id() { print -r -- "Håkans Mac" }\n${fake(row, seen)}`);
        expect(readFileSync(seen, 'utf8')).toContain(
          'host=neq.H%C3%A5kans%20Mac'
        );
      });
    });

    // The state and its source land in globals, so the caller's shell sees both
    describe('watch_state', () => {
      const remote =
        '[{"host":"nuc","at":"2026-11-05T00:00:00Z","watch":{"COD-1":{"pr":12,"state":"open","unresolved":1}}}]';
      const report = `print -r -- "$WATCH_SOURCE"; print -r -- "$WATCH_STATE"`;

      beforeEach(() => {
        stub('launchctl', 'exit 1');
        writeFileSync(
          join(dir, 'watch.json'),
          '{"COD-2":{"pr":3,"state":"open","unresolved":0}}'
        );
      });

      it('reads the file where the scheduler runs', () => {
        const out = run(`watch_state "${join(dir, 'watch.json')}"; ${report}`, {
          AGENT_QUEUE_HOST: 'container'
        });
        expect(out.stdout.trim().split('\n')).toEqual([
          'local',
          '{"COD-2":{"pr":3,"state":"open","unresolved":0}}'
        ]);
      });

      it('reads the remote row elsewhere', () => {
        const out = run(
          `supabase_select() { print -r -- '${remote}' }\nwatch_state "${join(dir, 'watch.json')}"; ${report}`
        );
        expect(out.stdout.trim().split('\n')).toEqual([
          'nuc · 2026-11-05T00:00:00Z',
          '{"COD-1":{"pr":12,"state":"open","unresolved":1}}'
        ]);
      });

      it('reads renovate.json beside the watch file where the scheduler runs', () => {
        writeFileSync(join(dir, 'renovate.json'), '{"754":{"pr":754}}');
        const out = run(
          `watch_state "${join(dir, 'watch.json')}"; print -r -- "$RENOVATE_STATE"`,
          { AGENT_QUEUE_HOST: 'container' }
        );
        expect(out.stdout.trim()).toBe('{"754":{"pr":754}}');
      });

      it('reads the remote row renovate elsewhere', () => {
        const withRenovate =
          '[{"host":"nuc","at":"2026-11-05T00:00:00Z","watch":{},"renovate":{"754":{"pr":754}}}]';
        const out = run(
          `supabase_select() { print -r -- '${withRenovate}' }\nwatch_state "${join(dir, 'watch.json')}"; print -r -- "$RENOVATE_STATE"`
        );
        expect(out.stdout.trim()).toBe('{"754":{"pr":754}}');
      });

      it('is {} when the row has no renovate, or no file exists', () => {
        const noRenovate = run(
          `supabase_select() { print -r -- '${remote}' }\nwatch_state "${join(dir, 'watch.json')}"; print -r -- "$RENOVATE_STATE"`
        );
        expect(noRenovate.stdout.trim()).toBe('{}');
        const noFile = run(
          `watch_state "${join(dir, 'watch.json')}"; print -r -- "$RENOVATE_STATE"`,
          { AGENT_QUEUE_HOST: 'container' }
        );
        expect(noFile.stdout.trim()).toBe('{}');
      });

      it('reads an empty renovate.json as {} where the scheduler runs', () => {
        writeFileSync(join(dir, 'renovate.json'), '');
        const out = run(
          `watch_state "${join(dir, 'watch.json')}"; print -r -- "$RENOVATE_STATE"`,
          { AGENT_QUEUE_HOST: 'container' }
        );
        expect(out.stdout.trim()).toBe('{}');
      });

      it('reads an empty watch.json as {} where the scheduler runs', () => {
        writeFileSync(join(dir, 'watch.json'), '');
        const out = run(`watch_state "${join(dir, 'watch.json')}"; ${report}`, {
          AGENT_QUEUE_HOST: 'container'
        });
        expect(out.stdout.trim().split('\n')).toEqual(['local', '{}']);
      });

      it('falls back to the file when the remote is unreadable', () => {
        const out = run(
          `supabase_select() { print -r -- '[]' }\nwatch_state "${join(dir, 'watch.json')}"; ${report}`
        );
        expect(out.stdout.trim().split('\n')).toEqual([
          'local, remote unreadable',
          '{"COD-2":{"pr":3,"state":"open","unresolved":0}}'
        ]);
      });
    });
  });
});
