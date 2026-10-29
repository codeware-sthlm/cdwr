import type { DataFailure } from '../data';

import { RETRACT } from './constants';

// The banner under the header: what is wrong with the sources, or that settings are missing

export type Notice =
  { hidden: true } | { hidden: false; severe: boolean; text: string };

const SUPABASE_ERRORS: readonly string[] = [
  'runs',
  'usage',
  'activity',
  'hostMetrics'
];

/** The sentence for a failure of the source behind `key` */
export const errorCopy = (e: DataFailure, key: string): string => {
  const source = SUPABASE_ERRORS.includes(key) ? 'Supabase' : 'Linear';
  switch (e.code) {
    case 'unauthorized':
      return source === 'Supabase'
        ? 'Supabase rejected the anon key. Check it in Settings.'
        : 'Linear rejected the API key. Check it in Settings.';
    case 'network':
      return (
        "Can't reach " +
        source +
        '. Showing the last data; it refreshes when the connection is back.'
      );
    case 'bad_response':
      return "Got an answer that couldn't be read.";
    case 'needs_reauth':
      return 'Linear needs reconnecting. Check the key in Settings, then refresh.';
    case 'server_not_connected':
    case 'selection_required':
      return "Linear isn't connected for you. Add the key in Settings, then refresh.";
    case 'not_in_manifest':
    case 'consent_required':
      return 'Linear is turned off for this page. Check the key in Settings.';
    case 'blocked_by_policy':
    case 'approval_required':
      return "Your organization's policy blocks this page from reading Linear.";
    case 'server_unavailable':
    case 'rate_limited':
      return (
        source + " didn't answer. Showing the last data; refresh to try again."
      );
    case 'tool_error':
      return (
        source + ' refused the request: ' + (e.message || 'no reason given')
      );
    default:
      return (
        "Couldn't load from " + source + ': ' + (e.message || 'unknown error')
      );
  }
};

/** `connected` is whether the data adapter has been started with settings */
export const notice = (
  errors: ReadonlyMap<string, DataFailure>,
  connected: boolean
): Notice => {
  if (!connected)
    return { hidden: false, severe: false, text: 'Waiting for settings.' };
  if (!errors.size) return { hidden: true };
  return {
    hidden: false,
    severe: [...errors.values()].some((e) => RETRACT.includes(e.code)),
    text: [...new Set([...errors].map(([key, e]) => errorCopy(e, key)))].join(
      ' '
    )
  };
};
