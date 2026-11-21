import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join } from 'node:path';

import {
  type Reply,
  type SessionMarks,
  countsDir,
  familyBase,
  marksIn,
  normaliseModel,
  roleOf,
  ticketAt,
  ticketOf
} from './usage.logic';

export const DAY_MS = 24 * 60 * 60 * 1000;

export interface Transcript {
  file: string;
  dirName: string;
  subagent: boolean;
}

export interface Entry extends Omit<Reply, 'id'> {
  id?: string;
  requestId?: string;
  output: number;
}

const num = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0;

/** The files of one project directory touched since a moment: sessions and their subagents */
const transcriptsIn = (
  projects: string,
  dirName: string,
  after: number
): Transcript[] => {
  const dir = join(projects, dirName);
  const found: Transcript[] = [];
  const consider = (file: string, subagent: boolean) => {
    if (file.endsWith('.jsonl') && statSync(file).mtimeMs >= after) {
      found.push({ file, dirName, subagent });
    }
  };
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isFile()) consider(join(dir, entry.name), false);
    if (!entry.isDirectory()) continue;
    const subagents = join(dir, entry.name, 'subagents');
    if (!existsSync(subagents)) continue;
    for (const name of readdirSync(subagents)) {
      consider(join(subagents, name), true);
    }
  }
  return found;
};

/** The homes whose Claude transcripts this host reads: its own, plus the container's session user */
export const transcriptHomes = (env: NodeJS.ProcessEnv): string[] => {
  const homes = [homedir()];
  if (env['AGENT_QUEUE_HOST'] === 'container') {
    homes.push(env['AGENT_QUEUE_SESSION_HOME'] ?? '/home/session');
  }
  return [...new Set(homes)];
};

/** The project directories of one home that count; an unreadable home gives none */
const projectDirs = (
  projects: string,
  keep: (name: string) => boolean
): string[] => {
  try {
    return readdirSync(projects, { withFileTypes: true })
      .filter((e) => e.isDirectory() && keep(e.name))
      .map((e) => e.name);
  } catch {
    return [];
  }
};

/**
 * The transcripts of this repo and its worktrees touched within the window; reads nothing but
 * directory entries. `homes` are scanned in turn (unreadable ones skipped), `allProjects` keeps
 * every Claude project, `after` (ms) replaces the day window.
 */
export const findTranscripts = (
  root: string,
  days: number,
  options: { allProjects?: boolean; after?: number; homes?: string[] } = {}
): { base: string; dirs: string[]; transcripts: Transcript[] } => {
  const base = familyBase(root);
  const after = options.after ?? Date.now() - (days + 1) * DAY_MS;
  const names = new Set<string>();
  const transcripts: Transcript[] = [];
  for (const home of options.homes ?? [homedir()]) {
    const projects = join(home, '.claude', 'projects');
    for (const dir of projectDirs(
      projects,
      (name) => options.allProjects || countsDir(name, base)
    )) {
      try {
        transcripts.push(...transcriptsIn(projects, dir, after));
        names.add(dir);
      } catch {
        // unreadable project directory
      }
    }
  }
  return { base, dirs: [...names].sort(), transcripts };
};

/* eslint-disable @typescript-eslint/no-explicit-any -- transcript lines are untyped JSON */
const parseLines = (file: string): { lines: any[]; skipped: number } => {
  const lines: any[] = [];
  let skipped = 0;
  let text: string;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    return { lines, skipped };
  }
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try {
      lines.push(JSON.parse(line));
    } catch {
      skipped++;
    }
  }
  return { lines, skipped };
};

/** The `session.sh` markers a session printed, from its tool results in order */
export const marksOf = (lines: any[]): SessionMarks => {
  const marks: SessionMarks = { registered: false, tickets: [] };
  for (const parsed of lines) {
    const stdout = parsed?.toolUseResult?.stdout;
    if (typeof stdout !== 'string' || typeof parsed.timestamp !== 'string') {
      continue;
    }
    const found = marksIn(stdout);
    if (found.registered) marks.registered = true;
    if (found.ticket !== undefined) {
      marks.tickets.push({ timestamp: parsed.timestamp, ticket: found.ticket });
    }
  }
  return marks;
};
/* eslint-enable @typescript-eslint/no-explicit-any */

const NO_MARKS: SessionMarks = { registered: false, tickets: [] };

/** `<dir>/<session id>/subagents/agent-….jsonl` → `<dir>/<session id>.jsonl` */
export const parentOf = (file: string): string => {
  const session = dirname(dirname(file));
  return join(dirname(session), `${basename(session)}.jsonl`);
};

/**
 * Every assistant reply in the transcripts, not yet de-duplicated. A reply's ticket is the one
 * its session named last with `session.sh ticket` (none after `ticket -`), else, before the
 * first marker, its git branch; a subagent takes its
 * parent's ticket at its own first reply, and its parent's registration for the role. The parent
 * is read even when it is outside the window.
 */
export const readReplies = (
  base: string,
  transcripts: Transcript[]
): { records: Entry[]; skippedLines: number } => {
  const records: Entry[] = [];
  let skippedLines = 0;
  const sessions = new Map<string, SessionMarks>();
  const parentMarks = (file: string): SessionMarks => {
    const parent = parentOf(file);
    let marks = sessions.get(parent);
    if (!marks) {
      marks = existsSync(parent) ? marksOf(parseLines(parent).lines) : NO_MARKS;
      sessions.set(parent, marks);
    }
    return marks;
  };

  // Sessions first, so a subagent finds its parent's markers already read
  const ordered = [
    ...transcripts.filter((t) => !t.subagent),
    ...transcripts.filter((t) => t.subagent)
  ];
  for (const { file, dirName, subagent } of ordered) {
    const { lines, skipped } = parseLines(file);
    skippedLines += skipped;
    const ours = countsDir(dirName, base);
    let marks = NO_MARKS;
    if (ours && !subagent) {
      marks = marksOf(lines);
      sessions.set(file, marks);
    } else if (ours) {
      marks = parentMarks(file);
    }
    const role = ours
      ? roleOf({ dirName, base, subagent, registered: marks.registered })
      : 'other';
    let firstReply: string | undefined;

    for (const parsed of lines) {
      if (parsed?.type !== 'assistant') continue;
      const message = parsed.message;
      const usage = message?.usage;
      if (!usage || typeof parsed.timestamp !== 'string') continue;
      if (typeof message.model !== 'string') continue;
      if (message.model === '<synthetic>') continue;

      firstReply ??= parsed.timestamp;
      const created = num(usage.cache_creation_input_tokens);
      const split = usage.cache_creation;
      const marked = ticketAt(
        marks.tickets,
        subagent ? firstReply : parsed.timestamp
      );
      records.push({
        id: message.id,
        requestId: parsed.requestId,
        output: num(usage.output_tokens),
        timestamp: parsed.timestamp,
        role,
        // A cleared ticket stays cleared; only a session that never named one falls back
        ticket:
          marked === undefined
            ? ticketOf(parsed.gitBranch)
            : (marked ?? 'unattributed'),
        model: normaliseModel(message.model),
        speed: usage.speed,
        tokens: {
          input: num(usage.input_tokens),
          output: num(usage.output_tokens),
          cacheRead: num(usage.cache_read_input_tokens),
          cacheWrite5m: split ? num(split.ephemeral_5m_input_tokens) : created,
          cacheWrite1h: split ? num(split.ephemeral_1h_input_tokens) : 0
        }
      });
    }
  }

  return { records, skippedLines };
};
