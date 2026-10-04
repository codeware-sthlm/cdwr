/** What the host's request to rebuild came to */
export type RebuildOutcome =
  { status: 'queued' } | { status: 'forbidden' } | { status: 'failed' };
