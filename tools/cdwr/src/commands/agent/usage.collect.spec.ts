import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { type Transcript, parentOf, readReplies } from './usage.collect';

const BASE = '/work/codeware';
const PLANNER = '-work-codeware-agent';

const reply = (timestamp: string, id: string, gitBranch = 'HEAD') => ({
  type: 'assistant',
  timestamp,
  gitBranch,
  message: {
    id,
    model: 'claude-opus-5-5',
    usage: { input_tokens: 1, output_tokens: 1 }
  }
});

const marker = (timestamp: string, stdout: string) => ({
  type: 'user',
  timestamp,
  toolUseResult: { stdout, stderr: '' }
});

const jsonl = (lines: unknown[]) =>
  lines.map((l) => JSON.stringify(l)).join('\n');

describe('readReplies', () => {
  let projects: string;

  beforeEach(() => {
    projects = mkdtempSync(join(tmpdir(), 'usage-collect-'));
  });

  afterEach(() => {
    rmSync(projects, { recursive: true, force: true });
  });

  const write = (dirName: string, path: string, lines: unknown[]) => {
    const file = join(projects, dirName, path);
    mkdirSync(join(file, '..'), { recursive: true });
    writeFileSync(file, jsonl(lines));
    return file;
  };

  const read = (transcripts: Transcript[]) =>
    readReplies(BASE, transcripts).records.map((r) => [r.id, r.role, r.ticket]);

  it('reads a queue session in the planner checkout as orchestrating, ticket by ticket', () => {
    const file = write(PLANNER, 's1.jsonl', [
      reply('2026-11-12T07:00:00.000Z', 'a'),
      marker('2026-11-12T07:00:01.000Z', 'registered work-queue session'),
      marker('2026-11-12T07:01:00.000Z', 'work-queue ticket COD-1'),
      reply('2026-11-12T07:02:00.000Z', 'b'),
      marker('2026-11-12T07:03:00.000Z', 'work-queue ticket -'),
      reply('2026-11-12T07:04:00.000Z', 'c'),
      marker('2026-11-12T07:05:00.000Z', 'work-queue ticket COD-2'),
      reply('2026-11-12T07:06:00.000Z', 'd')
    ]);
    expect(read([{ file, dirName: PLANNER, subagent: false }])).toEqual([
      ['a', 'orchestrating', 'unattributed'],
      ['b', 'orchestrating', 'COD-1'],
      ['c', 'orchestrating', 'unattributed'],
      ['d', 'orchestrating', 'COD-2']
    ]);
  });

  it("gives a subagent its parent's ticket at its first reply, as implementing", () => {
    write(PLANNER, 's1.jsonl', [
      marker('2026-11-12T07:00:00.000Z', 'registered work-queue session'),
      marker('2026-11-12T07:01:00.000Z', 'work-queue ticket COD-1'),
      marker('2026-11-12T07:10:00.000Z', 'work-queue ticket COD-2')
    ]);
    // Only the subagent is in the window: the parent is read for its markers
    const file = write(PLANNER, 's1/subagents/agent-x.jsonl', [
      reply('2026-11-12T07:05:00.000Z', 'a'),
      reply('2026-11-12T07:11:00.000Z', 'b')
    ]);
    expect(read([{ file, dirName: PLANNER, subagent: true }])).toEqual([
      ['a', 'implementing', 'COD-1'],
      ['b', 'implementing', 'COD-1']
    ]);
  });

  it("keeps a plan-only run's subagents as planning", () => {
    const parent = write(PLANNER, 's2.jsonl', [
      reply('2026-11-12T06:00:00.000Z', 'a')
    ]);
    const sub = write(PLANNER, 's2/subagents/agent-y.jsonl', [
      reply('2026-11-12T06:01:00.000Z', 'b')
    ]);
    expect(
      read([
        { file: sub, dirName: PLANNER, subagent: true },
        { file: parent, dirName: PLANNER, subagent: false }
      ])
    ).toEqual([
      ['a', 'planning', 'unattributed'],
      ['b', 'planning', 'unattributed']
    ]);
  });

  it('falls back on the git branch in a ticket worktree', () => {
    const dirName = '-work-codeware-cod-9';
    const file = write(dirName, 's3.jsonl', [
      reply('2026-11-12T06:00:00.000Z', 'a', 'cod-9-thing')
    ]);
    const sub = write(dirName, 's3/subagents/agent-z.jsonl', [
      reply('2026-11-12T06:01:00.000Z', 'b', 'cod-9-thing')
    ]);
    expect(
      read([
        { file, dirName, subagent: false },
        { file: sub, dirName, subagent: true }
      ])
    ).toEqual([
      ['a', 'orchestrating', 'COD-9'],
      ['b', 'implementing', 'COD-9']
    ]);
  });

  it('reads another project as other, whatever it printed', () => {
    const dirName = '-work-elsewhere';
    const file = write(dirName, 's4.jsonl', [
      marker('2026-11-12T06:00:00.000Z', 'work-queue ticket COD-1'),
      reply('2026-11-12T06:01:00.000Z', 'a')
    ]);
    expect(read([{ file, dirName, subagent: false }])).toEqual([
      ['a', 'other', 'unattributed']
    ]);
  });
});

describe('parentOf', () => {
  it('names the session transcript beside the subagents directory', () => {
    expect(parentOf('/p/-x/abc/subagents/agent-1.jsonl')).toBe(
      '/p/-x/abc.jsonl'
    );
  });
});
