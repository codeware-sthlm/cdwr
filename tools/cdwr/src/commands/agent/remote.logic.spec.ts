import { z } from 'zod';

import {
  excerpt,
  parseRemoteAnswer,
  remoteLines,
  remoteSteps,
  remoteSummary,
  unreadableAnswer
} from './remote.logic';

// secrets.sh prints a line before the command's own output
const SECRETS = 'secrets: 12 loaded from infisical';
const line = (value: unknown) => `${SECRETS}\n${JSON.stringify(value)}\n`;

const shape = z.object({ summary: z.string() });

describe('parseRemoteAnswer', () => {
  it('reads a failure with its hint', () => {
    const stdout = line({
      ok: false,
      error: { message: 'No scheduler', hint: 'cdwr agent pause', exitCode: 1 }
    });
    expect(parseRemoteAnswer(stdout, shape)).toEqual({
      kind: 'failed',
      message: 'No scheduler',
      hint: 'cdwr agent pause'
    });
  });

  it('reads a failure without a hint', () => {
    const stdout = line({
      ok: false,
      error: { message: 'Broken', exitCode: 1 }
    });
    expect(parseRemoteAnswer(stdout, shape)).toEqual({
      kind: 'failed',
      message: 'Broken'
    });
  });

  it('reads nothing to do', () => {
    const stdout = line({
      ok: true,
      command: 'agent pause',
      nothing: 'The queue is already paused'
    });
    expect(parseRemoteAnswer(stdout, shape)).toEqual({
      kind: 'nothing',
      nothing: 'The queue is already paused'
    });
  });

  it('reads a dry-run plan with its steps and notes', () => {
    const stdout = line({
      ok: true,
      command: 'agent run',
      dryRun: true,
      plan: {
        steps: [
          { label: 'Wake the container loop', detail: 'pid 1' },
          { label: 'No detail' }
        ],
        notes: ['A note']
      }
    });
    expect(parseRemoteAnswer(stdout, shape)).toEqual({
      kind: 'plan',
      steps: [
        { label: 'Wake the container loop', detail: 'pid 1' },
        { label: 'No detail' }
      ],
      notes: ['A note']
    });
  });

  it('reads a result', () => {
    const stdout = line({
      ok: true,
      command: 'agent pause',
      plan: { steps: [{ label: 'Pause the queue' }] },
      result: { summary: 'Queue paused' }
    });
    expect(parseRemoteAnswer(stdout, shape)).toEqual({
      kind: 'result',
      ok: true,
      result: { summary: 'Queue paused' }
    });
  });

  it('reads a partial result as not ok', () => {
    const stdout = line({
      ok: false,
      command: 'agent pause',
      plan: { steps: [] },
      result: { summary: 'Half done' }
    });
    expect(parseRemoteAnswer(stdout, shape)).toEqual({
      kind: 'result',
      ok: false,
      result: { summary: 'Half done' }
    });
  });

  it('takes the last JSON line', () => {
    const stdout = `${JSON.stringify({ ok: true, nothing: 'first' })}\n${JSON.stringify({ ok: true, nothing: 'second' })}\n`;
    expect(parseRemoteAnswer(stdout, shape)).toEqual({
      kind: 'nothing',
      nothing: 'second'
    });
  });

  it('skips a trailing line that is not JSON', () => {
    const stdout = `${line({ ok: true, nothing: 'Idle' })}{not json\ntrailing text\n`;
    expect(parseRemoteAnswer(stdout, shape)).toEqual({
      kind: 'nothing',
      nothing: 'Idle'
    });
  });

  it('is skew when the line has no result', () => {
    const stdout = line({ ok: true, command: 'agent pause', plan: {} });
    expect(parseRemoteAnswer(stdout, z.unknown())).toEqual({
      kind: 'skew',
      paths: ['result'],
      line: JSON.stringify({ ok: true, command: 'agent pause', plan: {} })
    });
  });

  it('is skew with the paths of a result that fails the shape', () => {
    const answer = parseRemoteAnswer(
      line({ ok: true, command: 'x', result: { summary: 5 } }),
      shape
    );
    expect(answer).toMatchObject({ kind: 'skew', paths: ['result.summary'] });
  });

  it('is skew at the root for a result of the wrong type', () => {
    const answer = parseRemoteAnswer(line({ ok: true, result: 'text' }), shape);
    expect(answer).toMatchObject({ kind: 'skew', paths: ['result'] });
  });

  it.each([
    ['empty', ''],
    ['garbage', 'hello\nworld\n'],
    ['broken JSON', `${SECRETS}\n{"ok": true,\n`],
    ['an array', '[1, 2]\n']
  ])('is none for %s', (_name, stdout) => {
    expect(parseRemoteAnswer(stdout, shape)).toEqual({ kind: 'none' });
  });
});

describe('remoteSteps', () => {
  it('says where each step runs', () => {
    expect(
      remoteSteps('agent-host', [
        { label: 'Pause the queue', detail: '/home/agent/paused' },
        { label: 'Wake' }
      ])
    ).toEqual([
      { label: 'Pause the queue', detail: '/home/agent/paused on agent-host' },
      { label: 'Wake', detail: 'on agent-host' }
    ]);
  });
});

describe('remoteSummary', () => {
  it.each([
    [{ summary: 'Queue paused' }, 'Queue paused'],
    [{ summary: 5 }, 'fallback'],
    [{}, 'fallback'],
    [null, 'fallback'],
    ['text', 'fallback'],
    [undefined, 'fallback']
  ])('reads %j as %s', (result, expected) => {
    expect(remoteSummary(result, 'fallback')).toBe(expected);
  });
});

describe('remoteLines', () => {
  it('reads a string array field', () => {
    expect(remoteLines({ next: ['a', 'b'] }, 'next')).toEqual(['a', 'b']);
    expect(remoteLines({ details: ['c'] }, 'details')).toEqual(['c']);
  });

  it.each([[{ next: 'a' }], [{ next: [1] }], [{}], [null], [undefined]])(
    'is undefined for %j',
    (result) => {
      expect(remoteLines(result, 'next')).toBeUndefined();
    }
  );
});

describe('excerpt', () => {
  it('flattens whitespace and cuts long text', () => {
    expect(excerpt('  a\n  b  ')).toBe('a b');
    expect(excerpt('x'.repeat(10), 4)).toBe('xxxx...');
  });
});

describe('unreadableAnswer', () => {
  it('names the host, the command and the deploy hint', () => {
    const message = unreadableAnswer('agent-host', 'cdwr agent pause', 'oops');
    expect(message).toContain('`cdwr agent pause` on agent-host');
    expect(message).toContain('cdwr agent deploy --host agent-host');
    expect(message).toContain('Answer starts: oops');
  });

  it('says so when the answer was empty', () => {
    expect(unreadableAnswer('h', 'cdwr agent run', '  ')).toContain(
      'Answer starts: (empty)'
    );
  });
});
