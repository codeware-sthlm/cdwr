/**
 * Makes a queue that runs work one piece after another.
 *
 * The next piece starts whether or not the one before it threw. Work that is
 * already in a turn must not ask for another, or it waits on itself.
 */
export const createTurnQueue = () => {
  let tail: Promise<unknown> = Promise.resolve();

  return <T>(work: () => Promise<T>): Promise<T> => {
    const turn = tail.then(work);
    tail = turn.catch(() => undefined);
    return turn;
  };
};
