import { describe, expect, it, vi } from 'vitest';

import { createStore } from './store';

describe('createStore', () => {
  it('keeps the state it was given', () => {
    const state = { n: 1 };
    expect(createStore(state).state).toBe(state);
  });

  it('wakes every subscriber on notify', () => {
    const store = createStore({});
    const a = vi.fn();
    const b = vi.fn();
    store.subscribe(a);
    store.subscribe(b);
    store.notify();
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it('stops waking a subscriber once it unsubscribes', () => {
    const store = createStore({});
    const a = vi.fn();
    const b = vi.fn();
    const off = store.subscribe(a);
    store.subscribe(b);
    off();
    store.notify();
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledTimes(1);
  });

  it('changes the snapshot on each notify', () => {
    const store = createStore({});
    const first = store.getSnapshot();
    expect(store.getSnapshot()).toBe(first);
    store.notify();
    const second = store.getSnapshot();
    expect(second).not.toBe(first);
    store.notify();
    expect(store.getSnapshot()).not.toBe(second);
  });
});
