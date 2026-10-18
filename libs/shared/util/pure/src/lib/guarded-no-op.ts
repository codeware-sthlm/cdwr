/** What the cms exit guard (`apps/cms/src/utils/exit-guard.ts`) prints when a script ends before `main` ran */
export const CMS_GUARD_MESSAGE = 'ended without completing';

/** Whether a command's output says the cms exit guard fired: nothing was written, so running it again is safe */
export const isGuardedNoOpOutput = (output: string): boolean =>
  output.includes(CMS_GUARD_MESSAGE);
