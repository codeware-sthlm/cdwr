import { createTurnQueue } from './turn-queue';

describe('createTurnQueue', () => {
  it('runs work one after another', async () => {
    const inTurn = createTurnQueue();
    const log: string[] = [];
    const work = (name: string, ms: number) => async () => {
      log.push(`${name} start`);
      await new Promise((resolve) => setTimeout(resolve, ms));
      log.push(`${name} end`);
      return name;
    };

    const results = await Promise.all([
      inTurn(work('a', 20)),
      inTurn(work('b', 1))
    ]);

    expect(results).toEqual(['a', 'b']);
    expect(log).toEqual(['a start', 'a end', 'b start', 'b end']);
  });

  it('starts the next turn after one threw', async () => {
    const inTurn = createTurnQueue();
    const failing = inTurn(() => Promise.reject(new Error('boom')));
    const next = inTurn(async () => 'ok');

    await expect(failing).rejects.toThrow('boom');
    await expect(next).resolves.toBe('ok');
  });
});
