import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { type Adapter, createAdapter } from './data';
import {
  openSettings as openSettingsSheet,
  openStartHash,
  setConnection,
  setControls,
  setLabeller,
  setLastIssue,
  setSettingsOpener,
  start
} from './desk/actions';
import { App } from './desk/app';
import { CommandError, checkToken } from './desk/commands';
import { LinearError, createLinear, linearMessage } from './linear';
import { platform } from './platform';
import {
  type Settings,
  type SettingsIssue,
  loadSettings,
  saveSettings
} from './settings';
import { SupabaseError, createSupabase } from './supabase';

import './fonts.css';
import './styles.css';

// Links open in the system browser in Tauri, in a new tab elsewhere
document.addEventListener('click', (event) => {
  const link = (event.target as Element | null)?.closest<HTMLAnchorElement>(
    'a[href^="http"]'
  );
  if (!link) return;
  event.preventDefault();
  void platform.openUrl(link.href);
});

const supabaseFor = ({ supabaseUrl, supabaseAnonKey }: Settings) =>
  createSupabase({ url: supabaseUrl, anonKey: supabaseAnonKey });

const linearFor = ({ linearKey }: Settings) =>
  createLinear({ key: linearKey, fetch: platform.fetch });

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
  if (settings.controlToken !== '')
    try {
      await checkToken(settings);
    } catch (error) {
      if (!(error instanceof CommandError)) throw error;
      issues.push({
        field: 'controlToken',
        message:
          error.code === 'unauthorized'
            ? error.message
            : error.code === 'network'
              ? "Can't reach the desk-command function."
              : `The desk-command function answered: ${error.message}`
      });
    }
  return issues;
};

let adapter: Adapter | undefined;

const startDesk = (settings: Settings): void => {
  adapter?.stop();
  const linear = linearFor(settings);
  adapter = createAdapter({
    linear,
    supabase: supabaseFor(settings),
    onLive: setConnection,
    onIssue: setLastIssue
  });
  setControls(
    settings.controlToken === ''
      ? null
      : {
          supabaseUrl: settings.supabaseUrl,
          controlToken: settings.controlToken
        }
  );
  setLabeller((ticket) => linear.addLabel(ticket, 'agent:ready'));
  start(adapter);
};

const boot = async (): Promise<void> => {
  const store = await platform.settingsStore();
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

  setSettingsOpener(openSettings);

  if (current) startDesk(current);
  else openSettings();
};

const root = document.getElementById('root');
if (!root) throw new Error('#root is missing from the page');
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
);
// The data adapter and the settings start outside React, so StrictMode's double effects never
// start a second loader
openStartHash();
void boot();
