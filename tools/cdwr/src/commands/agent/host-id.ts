import { execFileSync } from 'node:child_process';
import { hostname } from 'node:os';

/** The machine's stable name, as the queue scripts' host_id: a Mac's hostname follows the network */
export const hostId = (): string => {
  if (process.platform === 'darwin') {
    try {
      const name = execFileSync('scutil', ['--get', 'LocalHostName'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore']
      }).trim();
      if (name) return name;
    } catch {
      // fall through to the hostname
    }
  }
  return hostname().split('.')[0] ?? 'unknown';
};
