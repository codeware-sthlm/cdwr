import { useSyncExternalStore } from 'react';

/**
 * The desk's state behind a subscription: the state itself stays mutable, as the data layer and
 * the actions write it, and `notify()` tells React it changed. The snapshot is a version number,
 * so a render reads the state as it is after the latest change.
 */
export type Store<S> = {
  readonly state: S;
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => number;
  /** Wakes every subscriber; call it after each change to the state */
  notify: () => void;
};

export const createStore = <S>(state: S): Store<S> => {
  const listeners = new Set<() => void>();
  let version = 0;
  return {
    state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => version,
    notify: () => {
      version += 1;
      listeners.forEach((listener) => listener());
    }
  };
};

/** The store's state, re-rendering the component on every `notify()` */
export const useStore = <S>(store: Store<S>): S => {
  useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  return store.state;
};
