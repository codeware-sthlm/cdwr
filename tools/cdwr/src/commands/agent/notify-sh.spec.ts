import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { requireTools } from '../../testing/require-tools';

const SCRIPT = fileURLToPath(
  new URL('../../../agent-queue/notify.sh', import.meta.url)
);

const WEBHOOK = { SLACK_WEBHOOK_URL: 'https://hooks.example/x' };

describe('notify.sh', () => {
  requireTools('zsh');

  let dir: string;
  let body: string;
  // The queue home when AGENT_QUEUE_HOME is not set: HOME is the temp dir
  let home: string;

  const exec = (
    args: string[],
    env: Record<string, string> = {},
    options: { input?: string; cwd?: string } = {}
  ) =>
    spawnSync('zsh', [SCRIPT, ...args], {
      input: options.input ?? '',
      cwd: options.cwd,
      env: {
        PATH: process.env['PATH'] ?? '',
        HOME: dir,
        AGENT_QUEUE_CURL_CMD: `cat > "${body}"`,
        ...env
      },
      encoding: 'utf8'
    });

  // The hook's JSON form on stdin
  const run = (env: Record<string, string>, input: unknown) =>
    exec([], env, { input: JSON.stringify(input) });

  const setHome = (files: Record<string, string>) => {
    mkdirSync(home, { recursive: true });
    for (const [name, content] of Object.entries(files)) {
      writeFileSync(join(home, name), content);
    }
  };

  const posted = () =>
    JSON.parse(readFileSync(body, 'utf8')) as { text: string };

  const spooled = (spool: string) => {
    const files = existsSync(spool) ? readdirSync(spool) : [];
    return files.map(
      (f) =>
        JSON.parse(readFileSync(join(spool, f), 'utf8')) as Record<
          string,
          unknown
        >
    );
  };

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'notify-sh-'));
    body = join(dir, 'body.json');
    home = join(dir, '.cdwr', 'agent-queue');
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  describe('posting', () => {
    beforeEach(() => setHome({ 'notify-level': 'action\n' }));

    it('posts the message under the project name', () => {
      const result = run(WEBHOOK, {
        message: 'COD-1: plan ready',
        cwd: '/work/cdwr'
      });
      expect(result.status).toBe(0);
      expect(posted()).toEqual({ text: '*cdwr*: COD-1: plan ready' });
    });

    it('falls back to CLAUDE_SLACK_WEBHOOK and then the webhook file', () => {
      run(
        { CLAUDE_SLACK_WEBHOOK: 'https://hooks.example/y' },
        { message: 'm' }
      );
      expect(existsSync(body)).toBe(true);
      rmSync(body);
      mkdirSync(join(dir, '.claude'), { recursive: true });
      writeFileSync(
        join(dir, '.claude', 'slack-webhook'),
        'https://hooks.example/z\n'
      );
      run({}, { message: 'm' });
      expect(existsSync(body)).toBe(true);
    });

    // A session under dontAsk can't pass `$PWD` or a jq filter: any `$` gets the command denied
    it('takes the message as arguments, from the current directory', () => {
      const cwd = join(dir, 'cdwr');
      mkdirSync(cwd);
      const result = exec(['COD-1: stuck,', "it's denied"], WEBHOOK, { cwd });
      expect(result.status).toBe(0);
      expect(posted()).toEqual({ text: "*cdwr*: COD-1: stuck, it's denied" });
    });

    it('does nothing without a webhook or a spool', () => {
      const result = run({}, { message: 'm' });
      expect(result.status).toBe(0);
      expect(existsSync(body)).toBe(false);
      expect(readdirSync(home)).toEqual(['notify-level']);
    });

    it('uses AGENT_QUEUE_HOME for the dial', () => {
      const other = join(dir, 'other');
      mkdirSync(other);
      writeFileSync(join(other, 'notify-level'), 'all');
      rmSync(join(home, 'notify-level'));
      run({ ...WEBHOOK, AGENT_QUEUE_HOME: other }, { message: 'm' });
      expect(existsSync(body)).toBe(true);
    });
  });

  describe('the spool', () => {
    it('spools the notice without a webhook', () => {
      const spool = join(dir, 'spool');
      const result = run(
        { AGENT_QUEUE_NOTIFY_SPOOL: spool },
        { message: 'COD-1: plan ready', cwd: '/work/cdwr' }
      );
      expect(result.status).toBe(0);
      const files = readdirSync(spool);
      expect(files).toHaveLength(1);
      expect(files[0]).toMatch(/^\d+-\d+\.json$/);
      expect(spooled(spool)).toEqual([
        {
          text: '*cdwr*: COD-1: plan ready',
          level: 'action',
          source: 'session',
          ticket: 'COD-1',
          at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/)
        }
      ]);
      expect(files.some((f) => f.endsWith('.tmp'))).toBe(false);
      expect(existsSync(body)).toBe(false);
    });

    it('spools even with a webhook, whatever the dial says', () => {
      const spool = join(dir, 'spool');
      setHome({ 'notify-level': 'urgent' });
      const result = run(
        { ...WEBHOOK, AGENT_QUEUE_NOTIFY_SPOOL: spool },
        { message: 'm' }
      );
      expect(result.status).toBe(0);
      expect(spooled(spool)).toHaveLength(1);
      expect(existsSync(body)).toBe(false);
    });

    it('has a null ticket when the message names none', () => {
      const spool = join(dir, 'spool');
      run({ AGENT_QUEUE_NOTIFY_SPOOL: spool }, { message: 'no ticket here' });
      expect(spooled(spool)[0]?.['ticket']).toBeNull();
    });

    it('takes the level, source and ticket from the flags', () => {
      const spool = join(dir, 'spool');
      const cwd = join(dir, 'cdwr');
      mkdirSync(cwd);
      const result = exec(
        [
          '--level',
          'info',
          '--source',
          'run',
          '--ticket',
          'COD-7',
          'about COD-9'
        ],
        { AGENT_QUEUE_NOTIFY_SPOOL: spool },
        { cwd }
      );
      expect(result.status).toBe(0);
      expect(spooled(spool)).toEqual([
        {
          text: '*cdwr*: about COD-9',
          level: 'info',
          source: 'run',
          ticket: 'COD-7',
          at: expect.any(String)
        }
      ]);
    });

    it('takes the ticket from the first COD-n in the message', () => {
      const spool = join(dir, 'spool');
      exec(['COD-12 blocks COD-3'], { AGENT_QUEUE_NOTIFY_SPOOL: spool });
      expect(spooled(spool)[0]?.['ticket']).toBe('COD-12');
    });

    it('reads the JSON stdin form as an action', () => {
      const spool = join(dir, 'spool');
      run({ AGENT_QUEUE_NOTIFY_SPOOL: spool }, { message: 'needs you' });
      expect(spooled(spool)[0]).toMatchObject({
        level: 'action',
        source: 'session'
      });
    });

    it('exits 2 on an invalid level and writes nothing', () => {
      const spool = join(dir, 'spool');
      const result = exec(['--level', 'loud', 'm'], {
        ...WEBHOOK,
        AGENT_QUEUE_NOTIFY_SPOOL: spool
      });
      expect(result.status).toBe(2);
      expect(existsSync(spool)).toBe(false);
      expect(existsSync(body)).toBe(false);
    });

    describe('when a drain has reached Supabase', () => {
      const epoch = (ago: number) =>
        String(Math.floor(Date.now() / 1000) - ago);

      it('spools into the queue home when the drain is under 30 minutes old', () => {
        setHome({ 'notices-drained-at': epoch(60) });
        const result = exec(['COD-2 done'], WEBHOOK);
        expect(result.status).toBe(0);
        expect(spooled(join(home, 'notify-spool'))).toHaveLength(1);
        expect(existsSync(body)).toBe(false);
      });

      it('posts instead when the drain is older', () => {
        setHome({
          'notices-drained-at': epoch(31 * 60),
          'notify-level': 'action'
        });
        const result = exec(['COD-2 done'], WEBHOOK);
        expect(result.status).toBe(0);
        expect(existsSync(join(home, 'notify-spool'))).toBe(false);
        expect(posted().text).toMatch(/COD-2 done$/);
      });

      it('ignores a stamp that is not an epoch', () => {
        setHome({ 'notices-drained-at': 'yesterday' });
        exec(['m'], WEBHOOK);
        expect(existsSync(join(home, 'notify-spool'))).toBe(false);
      });
    });
  });

  describe('the dial', () => {
    const post = (level: string) =>
      exec(['--level', level, 'm'], WEBHOOK).status;

    it.each([
      ['urgent', 'urgent', true],
      ['urgent', 'action', false],
      ['urgent', 'info', false],
      ['action', 'urgent', true],
      ['action', 'action', true],
      ['action', 'info', false],
      ['all', 'urgent', true],
      ['all', 'action', true],
      ['all', 'info', true]
    ])('with %s a %s notice is posted: %s', (dial, level, expected) => {
      setHome({ 'notify-level': `${dial}\n` });
      expect(post(level)).toBe(0);
      expect(existsSync(body)).toBe(expected);
    });

    it('prefixes an urgent post', () => {
      setHome({ 'notify-level': 'urgent' });
      post('urgent');
      expect(posted().text).toMatch(/^:rotating_light: \*[^*]+\*.*: m$/);
    });

    it('does not prefix an action post', () => {
      setHome({ 'notify-level': 'action' });
      post('action');
      expect(posted().text).not.toContain(':rotating_light:');
    });

    it.each([
      ['a missing file', null],
      ['an unknown value', 'loud']
    ])('reads %s as urgent', (_, content) => {
      if (content !== null) setHome({ 'notify-level': content });
      expect(post('action')).toBe(0);
      expect(existsSync(body)).toBe(false);
      expect(post('urgent')).toBe(0);
      expect(existsSync(body)).toBe(true);
    });

    describe('the mute', () => {
      it('lets only urgent through until it ends', () => {
        setHome({
          'notify-level': 'all',
          'notify-mute-until': '2099-01-01T00:00:00.000Z\n'
        });
        post('action');
        post('info');
        expect(existsSync(body)).toBe(false);
        post('urgent');
        expect(existsSync(body)).toBe(true);
      });

      it('has no effect once it has passed', () => {
        setHome({
          'notify-level': 'all',
          'notify-mute-until': '2000-01-01T00:00:00Z'
        });
        post('info');
        expect(existsSync(body)).toBe(true);
      });
    });
  });

  describe('--passes', () => {
    const passes = (level: string) => exec(['--passes', level]).status;

    it('exits 0 for a level the dial lets through, else 1', () => {
      setHome({ 'notify-level': 'action' });
      expect(passes('urgent')).toBe(0);
      expect(passes('action')).toBe(0);
      expect(passes('info')).toBe(1);
      setHome({ 'notify-level': 'all' });
      expect(passes('info')).toBe(0);
    });

    it('exits 1 for an unknown level, and for all but urgent under a mute', () => {
      setHome({
        'notify-level': 'all',
        'notify-mute-until': '2099-01-01T00:00:00.000Z'
      });
      expect(passes('bogus')).toBe(1);
      expect(passes('action')).toBe(1);
      expect(passes('urgent')).toBe(0);
    });

    it('makes no post', () => {
      setHome({ 'notify-level': 'all' });
      passes('action');
      expect(existsSync(body)).toBe(false);
    });
  });

  describe('--send', () => {
    it('posts the text as it is and exits 0', () => {
      const result = exec(['--send', 'action', '*x*: hello'], WEBHOOK);
      expect(result.status).toBe(0);
      expect(posted()).toEqual({ text: '*x*: hello' });
    });

    it('prefixes an urgent text, whatever the dial says', () => {
      setHome({ 'notify-mute-until': '2099-01-01T00:00:00.000Z' });
      const result = exec(['--send', 'urgent', '*x*: hello'], WEBHOOK);
      expect(result.status).toBe(0);
      expect(posted()).toEqual({ text: ':rotating_light: *x*: hello' });
    });

    it('exits 3 without a webhook', () => {
      const result = exec(['--send', 'action', 'hello']);
      expect(result.status).toBe(3);
      expect(existsSync(body)).toBe(false);
    });

    it('exits 2 on a bad level or no text', () => {
      expect(exec(['--send', 'loud', 'hello'], WEBHOOK).status).toBe(2);
      expect(exec(['--send', 'action'], WEBHOOK).status).toBe(2);
      expect(exec(['--send'], WEBHOOK).status).toBe(2);
      expect(existsSync(body)).toBe(false);
    });

    it('exits 1 when the post fails', () => {
      const result = exec(['--send', 'action', 'hello'], {
        ...WEBHOOK,
        AGENT_QUEUE_CURL_CMD: 'cat >/dev/null; false'
      });
      expect(result.status).toBe(1);
    });
  });

  describe('--dial', () => {
    const dial = () =>
      JSON.parse(exec(['--dial']).stdout) as {
        level: string;
        muteUntil: string | null;
      };

    it('prints urgent and no mute for an empty home', () => {
      expect(dial()).toEqual({ level: 'urgent', muteUntil: null });
    });

    it('prints the level and a mute still ahead', () => {
      setHome({
        'notify-level': 'all',
        'notify-mute-until': '2099-01-01T00:00:00.000Z\n'
      });
      expect(dial()).toEqual({
        level: 'all',
        muteUntil: '2099-01-01T00:00:00.000Z'
      });
    });

    it('prints a null mute once it has passed', () => {
      setHome({
        'notify-level': 'action',
        'notify-mute-until': '2000-01-01T00:00:00Z'
      });
      expect(dial()).toEqual({ level: 'action', muteUntil: null });
    });
  });
});
