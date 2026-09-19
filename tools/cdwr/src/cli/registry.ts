import type { AnyCommand, Danger } from './command';

export interface Group {
  name: string;
  summary: string;
}

/** What the menu, help and completion know about a command without loading it */
export interface Entry {
  /** `['db', 'backup']`, or `['doctor']` for a top-level command */
  path: string[];
  summary: string;
  danger: Danger;
  load: () => Promise<AnyCommand>;
}

export const nameOf = (entry: Entry): string => entry.path.join(' ');

export type Lookup =
  | { kind: 'command'; entry: Entry; rest: string[] }
  | { kind: 'group'; group: Group; rest: string[] }
  | { kind: 'none'; rest: string[] };

/** Match the longest command path at the front of argv */
export function lookup(
  argv: string[],
  groups: Group[],
  entries: Entry[]
): Lookup {
  const words = argv.filter((a) => !a.startsWith('-'));
  for (const entry of [...entries].sort(
    (a, b) => b.path.length - a.path.length
  )) {
    const matches = entry.path.every((part, i) => words[i] === part);
    if (!matches) continue;
    const rest = dropWords(argv, entry.path.length);
    return { kind: 'command', entry, rest };
  }
  const group = groups.find((g) => g.name === words[0]);
  if (group) return { kind: 'group', group, rest: dropWords(argv, 1) };
  return { kind: 'none', rest: argv };
}

/** argv without its first `count` non-flag words */
const dropWords = (argv: string[], count: number): string[] => {
  let seen = 0;
  return argv.filter((a) => {
    if (a.startsWith('-') || seen >= count) return true;
    seen++;
    return false;
  });
};

/** Close matches for a mistyped command, for the "did you mean" hint */
export function suggest(
  word: string,
  entries: Entry[],
  groups: Group[]
): string[] {
  const names = [...groups.map((g) => g.name), ...entries.map(nameOf)];
  return names
    .filter(
      (name) =>
        distance(word, name.split(' ').pop() ?? name) <= 2 ||
        name.includes(word)
    )
    .slice(0, 3);
}

/** Levenshtein distance, one row at a time */
const distance = (a: string, b: string): number => {
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      const substitution =
        (previous[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1);
      current[j] = Math.min(
        (previous[j] ?? 0) + 1,
        (current[j - 1] ?? 0) + 1,
        substitution
      );
    }
    previous = current;
  }
  return previous[b.length] ?? 0;
};
