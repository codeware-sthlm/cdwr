import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
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
  it('keeps the key out of the curl command line', () => {
    expect(SCRIPT).not.toContain('-H "Authorization: $key"');
    expect(SCRIPT).not.toContain('-H "Authorization: Bearer $key"');
    expect(SCRIPT).toContain('-H @<(print -r -- "Authorization: $key")');
    expect(SCRIPT).toContain('-H @<(print -r -- "Authorization: $header")');
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
      ['connector by default', {}, 'connector'],
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
        { AGENT_QUEUE_LINEAR_KEY: 'sekret' }
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
      ).toBe('key: no Linear API key for the header helper');
    });

    // claude runs without the env key, so the helper cannot use it either
    it('key: an environment key alone does not count', () => {
      expect(
        run('linear_tools', {
          AGENT_QUEUE_LINEAR_MCP: 'key',
          AGENT_QUEUE_LINEAR_KEY: 'k'
        }).stdout.trim()
      ).toBe('key: no Linear API key for the header helper');
    });

    // Under errexit, as the scripts run: a curl that fails is a reason, not an exit
    it('key: names a failed request', () => {
      writeFileSync(join(dir, 'bin', 'curl'), '#!/bin/sh\nexit 28\n');
      chmodSync(join(dir, 'bin', 'curl'), 0o755);
      const result = run(
        'set -euo pipefail; why="$(linear_tools)"; print -r -- "after: $why"',
        { AGENT_QUEUE_LINEAR_MCP: 'key', AGENT_QUEUE_LINEAR_KEY_FILE: keyFile }
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
          AGENT_QUEUE_LINEAR_KEY_FILE: keyFile
        }).stdout.trim()
      ).toBe("key: Linear's MCP refused initialize");
    });

    it('key: sends the header from the file to Linear', () => {
      const seen = join(dir, 'seen');
      writeFileSync(
        join(bin(), 'curl'),
        `#!/bin/sh\nwhile [ $# -gt 0 ]; do case "$1" in -H) case "$2" in @*) cat "\${2#@}" >> "${seen}";; esac;; esac; shift; done\nprintf '%s\\n200' 'data: {"result":{}}'\n`
      );
      chmodSync(join(bin(), 'curl'), 0o755);
      run('linear_tools', {
        AGENT_QUEUE_LINEAR_MCP: 'key',
        AGENT_QUEUE_LINEAR_KEY_FILE: keyFile
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
  });
});
