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

  it('listens to notices on a channel of its own', () => {
    const onNotices = vi.fn();
    open().subscribe(
      () => undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      onNotices
    );
    const notices = made.find((c) => c.name === 'desk-notices');
    expect(notices).toBeDefined();
    vi.useFakeTimers();
    notices?.join('SUBSCRIBED');
    vi.advanceTimersByTime(1000);
    vi.useRealTimers();
    expect(onNotices).toHaveBeenCalledTimes(1);
  });

  const withTenantsAndNotices = (
    onTenants: () => void,
    onNotices: () => void
  ) =>
    open().subscribe(
      () => undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      onTenants,
      onNotices
    );

  it('keeps a pending notices refresh when a tenant event lands', () => {
    const onTenants = vi.fn();
    const onNotices = vi.fn();
    withTenantsAndNotices(onTenants, onNotices);
    vi.useFakeTimers();
    made.find((c) => c.name === 'desk-notices')?.join('SUBSCRIBED');
    made.find((c) => c.name === 'desk-tenants')?.join('SUBSCRIBED');
    vi.advanceTimersByTime(1000);
    vi.useRealTimers();
    expect(onNotices).toHaveBeenCalledTimes(1);
    expect(onTenants).toHaveBeenCalledTimes(1);
  });

  it('cancels a pending notices refresh on stop', () => {
    const onNotices = vi.fn();
    const stop = withTenantsAndNotices(vi.fn(), onNotices);
    vi.useFakeTimers();
    made.find((c) => c.name === 'desk-notices')?.join('SUBSCRIBED');
    void stop();
    vi.advanceTimersByTime(1000);
    vi.useRealTimers();
    expect(onNotices).not.toHaveBeenCalled();
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
