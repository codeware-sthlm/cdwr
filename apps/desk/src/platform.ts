import { isTauri } from '@tauri-apps/api/core';

import type { KeyValueStore } from './settings';

const FILE = 'settings.json';
const PREFIX = 'desk:';

/**
 * Settings in the browser's localStorage, behind what this page wrote: a storage that refuses
 * writes (a full quota, a private window) still answers until the page reloads.
 */
const browserStore = (): KeyValueStore => {
  const memory = new Map<string, string>();
  return {
    get: (key) => {
      if (memory.has(key)) return Promise.resolve(memory.get(key));
      try {
        const raw = localStorage.getItem(PREFIX + key);
        return Promise.resolve(
          raw === null ? undefined : (JSON.parse(raw) as unknown)
        );
      } catch {
        return Promise.resolve(undefined);
      }
    },
    set: (key, value) => {
      memory.set(key, value);
      try {
        localStorage.setItem(PREFIX + key, JSON.stringify(value));
      } catch {
        // Kept in memory until the page reloads
      }
      return Promise.resolve();
    },
    save: () => Promise.resolve()
  };
};

/** What differs between the Tauri app and a plain browser; chosen at call time. */
export const platform = {
  fetch: ((input, init) =>
    isTauri()
      ? import('@tauri-apps/plugin-http').then(({ fetch }) =>
          fetch(input, init)
        )
      : globalThis.fetch(input, init)) as typeof fetch,

  openUrl: async (href: string): Promise<void> => {
    if (isTauri()) {
      const { openUrl } = await import('@tauri-apps/plugin-opener');
      await openUrl(href);
    } else window.open(href, '_blank', 'noopener');
  },

  /** The desk's own settings file in Tauri; the browser store when that cannot open */
  settingsStore: async (): Promise<KeyValueStore> => {
    if (!isTauri()) return browserStore();
    try {
      const { load } = await import('@tauri-apps/plugin-store');
      const store = await load(FILE, { autoSave: false });
      return {
        get: (key) => store.get(key),
        set: (key, value) => store.set(key, value),
        save: () => store.save()
      };
    } catch {
      return browserStore();
    }
  }
};
