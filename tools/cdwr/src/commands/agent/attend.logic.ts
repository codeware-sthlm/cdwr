import { dirname, join } from 'node:path';

/** What git and the disk say about the checkout an attended session runs from */
export interface AttendState {
  exists: boolean;
  /** Its git common dir is this clone's */
  ofThisClone: boolean;
  /** `git status --porcelain` lists something */
  dirty: boolean;
  detached: boolean;
  head: string;
  /** `origin/main` after the fetch */
  main: string;
  /** pnpm-lock.yaml differs between head and origin/main */
  lockfileChanged: boolean;
  hasNodeModules: boolean;
}

export type AttendStep = 'switch' | 'install';

export type AttendPlan =
  { refuse: string } | { steps: AttendStep[]; main: string };

const short = (sha: string): string => sha.slice(0, 8);

/** The checkout the session runs from: a sibling of the workspace unless given */
export const attendPath = (root: string): string =>
  join(dirname(root), 'codeware-queue');

/** The line that starts the session in the checkout */
export const startLine = (path: string): string =>
  `cd ${path} && claude "/work-queue"`;

/** Refuses a checkout that is not safe to move, else lists what brings it to origin/main */
export function planAttend(state: AttendState, path: string): AttendPlan {
  if (!state.exists) return { refuse: `${path} does not exist` };
  if (!state.ofThisClone) {
    return { refuse: `${path} is not a worktree of this clone` };
  }
  if (state.dirty) return { refuse: `${path} has uncommitted changes` };
  if (!state.detached) {
    return { refuse: `${path} is on a branch, not a detached HEAD` };
  }
  const steps: AttendStep[] = [
    ...(state.head === state.main ? [] : (['switch'] as const)),
    ...(state.lockfileChanged || !state.hasNodeModules
      ? (['install'] as const)
      : [])
  ];
  return { steps, main: state.main };
}

/** One line per step, or the line for a checkout that needs nothing */
export const describeStep = (step: AttendStep, main: string): string =>
  step === 'switch'
    ? `Switch to origin/main ${short(main)}`
    : 'Install dependencies';

export const upToDate = (main: string): string =>
  `Already at origin/main ${short(main)}`;

export const ready = (main: string): string =>
  `The checkout is at origin/main ${short(main)}`;
