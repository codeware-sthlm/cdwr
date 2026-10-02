/** Builds run one after another: each costs a few hundred MB. */
let tail: Promise<unknown> = Promise.resolve();

/**
 * Runs `work` once every earlier turn has settled.
 *
 * The next turn starts whether or not this one threw. Work that is already in
 * a turn must not ask for another, or it waits on itself.
 */
export const inBuildTurn = <T>(work: () => Promise<T>): Promise<T> => {
  const turn = tail.then(work);
  tail = turn.catch(() => undefined);
  return turn;
};
