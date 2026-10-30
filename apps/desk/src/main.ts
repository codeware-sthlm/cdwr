import '@fontsource/hanken-grotesk/400.css';
import '@fontsource/hanken-grotesk/500.css';
import '@fontsource/hanken-grotesk/600.css';
import '@fontsource/hanken-grotesk/700.css';
import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import { openUrl } from '@tauri-apps/plugin-opener';

import { type Adapter, createAdapter } from './data';
import { setConnection, setLastIssue, start } from './desk';
import { LinearError, createLinear } from './linear';
import {
  type KeyValueStore,
  type Settings,
  type SettingsIssue,
  loadSettings,
  saveSettings
} from './settings';
import { openSettingsSheet } from './settings-sheet';
import { openSettingsStore } from './settings-store';
import { SupabaseError, createSupabase } from './supabase';

import './fonts.css';
import './desk.css';

// Links open in the system browser, not in the webview
document.addEventListener('click', (event) => {
  const link = (event.target as Element | null)?.closest<HTMLAnchorElement>(
    'a[href^="http"]'
  );
  if (!link) return;
  event.preventDefault();
  void openUrl(link.href);
});

const supabaseFor = ({ supabaseUrl, supabaseAnonKey }: Settings) =>
  createSupabase({ url: supabaseUrl, anonKey: supabaseAnonKey });

const linearFor = ({ linearKey }: Settings) =>
  createLinear({ key: linearKey, fetch: tauriFetch });

const linearMessage = (error: LinearError): string =>
  error.code === 'unauthorized'
    ? 'Linear rejected this key.'
    : error.code === 'network'
      ? "Can't reach Linear. Check the connection."
      : error.message;

const supabaseIssue = (error: SupabaseError): SettingsIssue =>
  error.code === 'unauthorized'
    ? { field: 'supabaseAnonKey', message: 'Supabase rejected this key.' }
    : error.code === 'network'
      ? {
          field: 'supabaseUrl',
          message: "Can't reach Supabase at this URL."
        }
      : {
          field: 'supabaseUrl',
          message: `Supabase answered, but the queue could not be read: ${error.message}`
        };

/** Tries both connections with the entered values; anything but a known failure propagates. */
const verify = async (settings: Settings): Promise<SettingsIssue[]> => {
  const issues: SettingsIssue[] = [];
  try {
    await linearFor(settings).viewer();
  } catch (error) {
    if (!(error instanceof LinearError)) throw error;
    issues.push({ field: 'linearKey', message: linearMessage(error) });
  }
  try {
    await supabaseFor(settings).check();
  } catch (error) {
    if (!(error instanceof SupabaseError)) throw error;
    issues.push(supabaseIssue(error));
  }
  return issues;
};

const memoryStore = (): KeyValueStore => {
  const values = new Map<string, unknown>();
  return {
    get: (key) => Promise.resolve(values.get(key)),
    set: (key, value) => {
      values.set(key, value);
      return Promise.resolve();
    },
    save: () => Promise.resolve()
  };
};

let adapter: Adapter | undefined;

const setLive = (live: boolean): void => {
  const el = document.getElementById('live');
  if (!el) return;
  el.dataset.live = String(live);
  el.textContent = live ? 'Live' : 'Refreshing every 5 min';
  el.title = live
    ? 'Linear and the queue push changes as they happen. Focus and Refresh still reload everything.'
    : 'Live updates are not connected. The desk reloads every 5 minutes, on focus and on Refresh.';
};

const startDesk = (settings: Settings): void => {
  adapter?.stop();
  adapter = createAdapter({
    linear: linearFor(settings),
    supabase: supabaseFor(settings),
    onLive: (live, connection) => {
      setLive(live);
      setConnection(live, connection);
    },
    onIssue: setLastIssue
  });
  start(adapter);
};

const boot = async (): Promise<void> => {
  // Outside Tauri there is no store; the settings then last until the page reloads
  const store = await openSettingsStore().catch(memoryStore);
  let current = await loadSettings(store).catch(() => null);

  const openSettings = (): void =>
    openSettingsSheet({
      current,
      verify,
      onSaved: async (settings) => {
        await saveSettings(store, settings);
        current = settings;
        startDesk(settings);
      }
    });

  document.getElementById('settings')?.addEventListener('click', openSettings);

  if (current) startDesk(current);
  else openSettings();
};

void boot();
