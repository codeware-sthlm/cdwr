import type { JobHost } from '../types';

// The page's words for a session state, a job host and why a ticket is queued

const SESSION: ReadonlyMap<string, string> = new Map([
  ['alive', 'Session live'],
  ['waiting', 'Session waits on you'],
  ['stopped', 'Session stopped'],
  ['none', 'No session']
]);

/** The session pill's label; a state the page does not list shows as it is */
export const sessionLabel = (state: string): string =>
  SESSION.get(state) ?? state;

const HOST: Record<JobHost, string> = {
  container: 'Container',
  launchd: 'Mac · launchd'
};

export const hostName = (host: JobHost): string => HOST[host];

// The chip text and class of why a ticket is queued
const REASON: ReadonlyMap<string, readonly [string, string]> = new Map([
  ['resume', ['resume', 'resume']],
  ['take over', ['take over', 'takeover']],
  ['answered', ['answered', 'answered']],
  ['review feedback', ['review feedback', 'feedback']],
  ['conflicts with main', ['conflicts with main', 'conflict']],
  ['merged comment', ['merged comment', 'comment']],
  ['renovate', ['renovate', 'renovate']],
  ['ready', ['ready', 'ready']]
]);

/** The chip's text and class for why a ticket is queued; a reason the page does not list shows as it is */
export const reasonChipData = (
  reason: string | undefined
): readonly [text: string | undefined, kind: string] =>
  (reason !== undefined && REASON.get(reason)) || [reason, 'resume'];
