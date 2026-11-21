import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { EXIT } from '../../cli/errors';
import { memoryPrefs } from '../../cli/prefs';
import { runCommand } from '../../cli/run';
import { fakeUi } from '../../testing/fake-ui';

vi.mock('../../cli/preflight', () => ({ preflight: vi.fn() }));

interface Out {
  ok: boolean;
  nothing?: string;
  plan?: { steps: { label: string }[] };
  result?: { summary?: string; level: string; muteUntil: string | null };
  error?: { message: string };
}

const FUTURE = '2999-01-01T00:00:00.000Z';

describe('agent notify', () => {
  let home: string;
  let queue: string;

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'notify-'));
    queue = join(home, 'agent-queue');
    mkdirSync(queue, { recursive: true });
  });

  async function go(argv: string[]) {
    const printed: string[] = [];
    const command = (await import('./notify')).default;
    const exit = await runCommand({
      name: 'agent notify',
      command,
      argv: [...argv, '--json'],
      root: '/nowhere',
      env: { CDWR_HOME: home, AGENT_QUEUE_HOST: 'container' },
      prefs: memoryPrefs(),
      interactive: false,
      ui: fakeUi([]),
      history: () => undefined,
      stdout: (text) => printed.push(text)
    });
    return { exit, last: JSON.parse(printed.at(-1) ?? '{}') as Out };
  }

  it('prints both settings without arguments, urgent and not muted by default', async () => {
    const { exit, last } = await go([]);
    expect(exit).toBe(EXIT.ok);
    expect(last.nothing).toBe('Notify level: urgent · not muted');
  });

  it('prints the mute while it is in force', async () => {
    writeFileSync(join(queue, 'notify-level'), 'action\n');
    writeFileSync(join(queue, 'notify-mute-until'), `${FUTURE}\n`);
    const { last } = await go([]);
    expect(last.nothing).toBe(`Notify level: action · muted until ${FUTURE}`);
  });

  it('reads a past mute as not muted', async () => {
    writeFileSync(
      join(queue, 'notify-mute-until'),
      '2000-01-01T00:00:00.000Z\n'
    );
    const { last } = await go([]);
    expect(last.nothing).toBe('Notify level: urgent · not muted');
  });

  it('sets the level and reports level and muteUntil', async () => {
    const { exit, last } = await go(['all', '--yes']);
    expect(exit).toBe(EXIT.ok);
    expect(readFileSync(join(queue, 'notify-level'), 'utf8')).toBe('all\n');
    expect(last.result).toMatchObject({ level: 'all', muteUntil: null });
  });

  it('sets the mute without touching the level', async () => {
    const { exit, last } = await go(['--mute-until', FUTURE, '--yes']);
    expect(exit).toBe(EXIT.ok);
    expect(readFileSync(join(queue, 'notify-mute-until'), 'utf8')).toBe(
      `${FUTURE}\n`
    );
    expect(existsSync(join(queue, 'notify-level'))).toBe(false);
    expect(last.result).toMatchObject({ level: 'urgent', muteUntil: FUTURE });
  });

  it('sets level and mute together', async () => {
    const { last } = await go(['action', '--mute-until', FUTURE, '--yes']);
    expect(last.result).toMatchObject({ level: 'action', muteUntil: FUTURE });
  });

  it('ends the mute with off', async () => {
    writeFileSync(join(queue, 'notify-mute-until'), `${FUTURE}\n`);
    const { exit, last } = await go(['--mute-until', 'off', '--yes']);
    expect(exit).toBe(EXIT.ok);
    expect(existsSync(join(queue, 'notify-mute-until'))).toBe(false);
    expect(last.result).toMatchObject({ muteUntil: null });
  });

  it('has nothing to do for off without a mute', async () => {
    const { exit, last } = await go(['--mute-until', 'off', '--yes']);
    expect(exit).toBe(EXIT.ok);
    expect(last.nothing).toBe('Already Notify level: urgent · not muted');
  });

  it('refuses a time it cannot read', async () => {
    const { exit, last } = await go(['--mute-until', 'tomorrow-ish', '--yes']);
    expect(exit).not.toBe(EXIT.ok);
    expect(last.error?.message).toContain('--mute-until');
    expect(existsSync(join(queue, 'notify-mute-until'))).toBe(false);
  });
});
