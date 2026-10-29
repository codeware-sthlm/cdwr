import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import {
  type Reply,
  countsDir,
  familyBase,
  normaliseModel,
  roleOf,
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

/**
 * The transcripts of this repo and its worktrees touched within the window; reads nothing but
 * directory entries. `allProjects` keeps every Claude project, `after` (ms) replaces the day window.
 */
export const findTranscripts = (
  root: string,
  days: number,
  options: { allProjects?: boolean; after?: number } = {}
): { base: string; dirs: string[]; transcripts: Transcript[] } => {
  const projects = join(homedir(), '.claude', 'projects');
  const base = familyBase(root);
  const dirs = existsSync(projects)
    ? readdirSync(projects, { withFileTypes: true })
        .filter(
          (e) =>
            e.isDirectory() && (options.allProjects || countsDir(e.name, base))
        )
        .map((e) => e.name)
        .sort()
    : [];
  const after = options.after ?? Date.now() - (days + 1) * DAY_MS;
  const transcripts = dirs.flatMap((dir) =>
    transcriptsIn(projects, dir, after)
  );
  return { base, dirs, transcripts };
};

/** Every assistant reply in the transcripts, not yet de-duplicated */
export const readReplies = (
  base: string,
  transcripts: Transcript[]
): { records: Entry[]; skippedLines: number } => {
  const records: Entry[] = [];
  let skippedLines = 0;

  for (const { file, dirName, subagent } of transcripts) {
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      let parsed;
      try {
        parsed = JSON.parse(line);
      } catch {
        skippedLines++;
        continue;
      }
      if (parsed?.type !== 'assistant') continue;
      const message = parsed.message;
      const usage = message?.usage;
      if (!usage || typeof parsed.timestamp !== 'string') continue;
      if (typeof message.model !== 'string') continue;
      if (message.model === '<synthetic>') continue;

      const created = num(usage.cache_creation_input_tokens);
      const split = usage.cache_creation;
      records.push({
        id: message.id,
        requestId: parsed.requestId,
        output: num(usage.output_tokens),
        timestamp: parsed.timestamp,
        role: countsDir(dirName, base)
          ? roleOf({ dirName, base, subagent })
          : 'other',
        ticket: ticketOf(parsed.gitBranch),
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
