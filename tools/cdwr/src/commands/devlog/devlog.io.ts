import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { CliError } from '../../cli/errors';

import {
  COVERED_FILE,
  type CoveredRow,
  DEVICE_ID_FILE,
  parseCovered
} from './devlog.logic';

export const coveredPath = (home: string): string => join(home, COVERED_FILE);

const missing = (error: unknown): boolean =>
  (error as NodeJS.ErrnoException).code === 'ENOENT';

/** What the cms commands need from the cdwr env; the signature secret only in host mode */
export function cmsCredentials(env: NodeJS.ProcessEnv): {
  cmsUrl: string;
  key: string;
  signatureSecret?: string;
} {
  const cmsUrl = env['CMS_URL'];
  const key = env['CMS_AGENT_API_KEY'];
  if (!cmsUrl || !key) {
    throw new CliError(
      'CMS_URL and CMS_AGENT_API_KEY are not both set',
      undefined,
      'Add them to tools/cdwr/.env (see .env.example)'
    );
  }
  return {
    cmsUrl,
    key,
    signatureSecret: env['CMS_SIGNATURE_SECRET'] || undefined
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The id this machine signs with, made once and kept in the queue home */
export async function deviceIdIn(home: string): Promise<string> {
  const file = join(home, DEVICE_ID_FILE);
  let existing: string | undefined;
  try {
    existing = (await readFile(file, 'utf8')).trim();
  } catch (error) {
    if (!missing(error)) throw error;
  }
  if (existing === undefined) {
    const id = randomUUID();
    await mkdir(home, { recursive: true });
    await writeFile(file, `${id}\n`);
    return id;
  }
  // generateSignature takes a UUID only, so anything else fails there, later
  if (!UUID.test(existing)) {
    throw new CliError(
      `${file} does not hold a device id`,
      undefined,
      'Delete the file; a new id is written on the next run'
    );
  }
  return existing;
}

/** The covered rows; a file that was never written is an empty list */
export async function readCovered(home: string): Promise<CoveredRow[]> {
  try {
    return parseCovered(await readFile(coveredPath(home), 'utf8'));
  } catch (error) {
    if (missing(error)) return [];
    throw error;
  }
}
