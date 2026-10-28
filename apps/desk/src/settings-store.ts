import { load } from '@tauri-apps/plugin-store';

import type { KeyValueStore } from './settings';

const FILE = 'settings.json';

/** The desk's own settings file; saved only when `save` is called. */
export const openSettingsStore = async (): Promise<KeyValueStore> => {
  const store = await load(FILE, { autoSave: false });
  return {
    get: (key) => store.get(key),
    set: (key, value) => store.set(key, value),
    save: () => store.save()
  };
};
