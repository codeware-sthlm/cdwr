import { beforeEach, describe, expect, it, vi } from 'vitest';

import { type ChannelStatus, createSupabase } from './supabase';

type FakeChannel = {
  name: string;
  on: () => FakeChannel;
  subscribe: (cb?: (status: string) => void) => FakeChannel;
  join: (status: string) => void;
};

const made: FakeChannel[] = [];
const removals: (() => void)[] = [];
const removeChannel = vi.fn(
  () =>
    new Promise<string>((resolve) => {
      removals.push(() => resolve('ok'));
    })
);

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    channel: (name: string): FakeChannel => {
      let callback: ((status: string) => void) | undefined;
      const channel: FakeChannel = {
        name,
        on: () => channel,
        subscribe: (cb) => {
          callback = cb;
          return channel;
        },
        join: (status) => callback?.(status)
      };
      made.push(channel);
      return channel;
    },
    removeChannel
  })
}));

describe('createSupabase subscribe', () => {
  beforeEach(() => {
    made.length = 0;
    removals.length = 0;
    removeChannel.mockClear();
  });

  const open = () =>
    createSupabase({ url: 'https://x.supabase.co', anonKey: 'anon' });

  it('passes the channel status along with the health', () => {
    const seen: [boolean, ChannelStatus][] = [];
    open().subscribe(
      () => undefined,
      (healthy, status) => seen.push([healthy, status])
    );
    const desk = made.find((c) => c.name === 'desk');
    desk?.join('SUBSCRIBED');
    desk?.join('CHANNEL_ERROR');
    desk?.join('TIMED_OUT');
    desk?.join('CLOSED');
    desk?.join('JOINING');
    expect(seen).toEqual([
      [true, 'SUBSCRIBED'],
      [false, 'CHANNEL_ERROR'],
      [false, 'TIMED_OUT'],
      [false, 'CLOSED']
    ]);
  });

  it('resolves its stop once every channel is removed', async () => {
    const stop = open().subscribe(() => undefined);
    let done = false;
    const stopped = stop().then(() => {
      done = true;
    });
    expect(removeChannel).toHaveBeenCalledTimes(made.length);
    await Promise.resolve();
    expect(done).toBe(false);
    for (const release of removals) release();
    await stopped;
    expect(done).toBe(true);
  });

  it('resolves its stop even when a removal fails', async () => {
    removeChannel.mockImplementationOnce(() => Promise.reject(new Error('x')));
    const stop = open().subscribe(() => undefined);
    const stopped = stop();
    for (const release of removals) release();
    await expect(stopped).resolves.toBeUndefined();
  });
});
