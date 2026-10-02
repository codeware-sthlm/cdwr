import { createTurnQueue } from '@codeware/shared/util/pure';

/** Builds run one after another: each costs a few hundred MB. */
export const inBuildTurn = createTurnQueue();
