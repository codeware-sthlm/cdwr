import { dirname, join } from 'node:path';

import { shellQuote } from '../../services/shell';

/** What git and the disk say about the checkout an attended session runs from */
export interface AttendState {
  exists: boolean;
  /** Its git common dir is this clone's */
  ofThisClone: boolean;
  /** `git status --porcelain` lists something */
  dirty: boolean;
  detached: boolean;
  head: string;
  /** `origin/main` as `git ls-remote` reports it */
  main: string;
  /** node_modules was installed from the current pnpm-lock.yaml */
  markerMatches: boolean;
}

export type AttendStep = 'switch' | 'install' | 'start';

export type AttendPlan =
  { refuse: string } | { steps: AttendStep[]; main: string };

const short = (sha: string): string => sha.slice(0, 8);

/** The checkout the session runs from: a sibling of the workspace unless given */
export const attendPath = (root: string): string =>
  join(dirname(root), 'codeware-queue');

const TICKET = /^COD-\d+$/i;

/** A ticket id in canonical form, or undefined when it is not one */
export const parseTicket = (value: string): string | undefined => {
  const ticket = value.trim();
  return TICKET.test(ticket) ? ticket.toUpperCase() : undefined;
};

/** The prompt the session starts with, for the ticket when given */
export const startPrompt = (ticket?: string): string =>
  ticket ? `/work-queue ${ticket}` : '/work-queue';

/** The line that starts the session in the checkout */
export const startLine = (path: string, ticket?: string): string =>
  `cd ${shellQuote(path)} && claude "${startPrompt(ticket)}"`;

export const describeStart = (path: string, ticket?: string): string =>
  `Start ${startPrompt(ticket)} in ${path}`;

/** Refuses a checkout that is not safe to move, else lists what brings it to origin/main, then the start */
export function planAttend(
  state: AttendState,
  path: string,
  { start }: { start: boolean }
): AttendPlan {
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
    ...(state.head !== state.main || !state.markerMatches
      ? (['install'] as const)
      : []),
    ...(start ? (['start'] as const) : [])
  ];
  return { steps, main: state.main };
}

/** One line per step, or the line for a checkout that needs nothing */
export const describeStep = (
  step: Exclude<AttendStep, 'start'>,
  main: string
): string =>
  step === 'switch'
    ? `Switch to origin/main ${short(main)}`
    : 'Install dependencies when the lockfile changed';

export const upToDate = (main: string): string =>
  `Already at origin/main ${short(main)}`;

export const ready = (main: string): string =>
  `The checkout is at origin/main ${short(main)}`;
