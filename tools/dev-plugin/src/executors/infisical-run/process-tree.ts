import { execFileSync } from 'node:child_process';

/** One `pid ppid` pair per process */
export type ProcessTable = ReadonlyArray<readonly [pid: number, ppid: number]>;

/** The descendants of `pid`, deepest first, `pid` itself excluded */
export const descendants = (pid: number, table: ProcessTable): number[] => {
  const children = new Map<number, number[]>();
  for (const [child, parent] of table) {
    children.set(parent, [...(children.get(parent) ?? []), child]);
  }
  const found: number[] = [];
  const visit = (parent: number) => {
    for (const child of children.get(parent) ?? []) {
      if (child === pid || found.includes(child)) continue;
      found.push(child);
      visit(child);
    }
  };
  visit(pid);
  return found.reverse();
};

/** Parses `ps -A -o pid=,ppid=` output */
export const parseProcessTable = (output: string): ProcessTable =>
  output
    .split('\n')
    .map((line) => line.trim().split(/\s+/).map(Number))
    .flatMap(([pid, ppid]) =>
      pid !== undefined && ppid !== undefined && !Number.isNaN(pid + ppid)
        ? [[pid, ppid] as const]
        : []
    );

const signalQuietly = (pid: number, signal: NodeJS.Signals) => {
  try {
    process.kill(pid, signal);
  } catch {
    // Already gone (ESRCH), or not ours to signal
  }
};

/** Signals a process and everything it started; Windows has no signals, so the tree is taskkilled */
export const killTree = (pid: number, signal: NodeJS.Signals): void => {
  if (process.platform === 'win32') {
    try {
      execFileSync('taskkill', ['/pid', String(pid), '/T', '/F'], {
        stdio: 'ignore'
      });
    } catch {
      // Already gone
    }
    return;
  }
  let table: ProcessTable = [];
  try {
    table = parseProcessTable(
      execFileSync('ps', ['-A', '-o', 'pid=,ppid='], { encoding: 'utf8' })
    );
  } catch {
    // Without a table only the child itself is signalled
  }
  for (const target of descendants(pid, table)) signalQuietly(target, signal);
  signalQuietly(pid, signal);
};
