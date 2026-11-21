import { rateLimit } from '@codeware/shared/util/human-check';
import {
  parseInviteCode,
  verifyInviteSecret
} from '@codeware/shared/util/invite-code';
import type { PostgresAdapter } from '@payloadcms/db-postgres';
import { sql } from '@payloadcms/db-postgres';
import type { BasePayload } from 'payload';

import { mapToRuntime } from '../map-to-runtime';
import type { PayloadRuntime } from '../payload-runtime.types';

/** What a typed code turns out to be, cheapest and least revealing first */
export type InviteCodeVerdict =
  'closed' | 'throttled' | 'unknown' | 'expired' | 'exhausted' | 'valid';

/** Thrown by {@link consumeInviteCode}, so the surrounding signup rolls back */
export class InviteCodeRefused extends Error {
  constructor(readonly verdict: Exclude<InviteCodeVerdict, 'valid'>) {
    super(`The invite code was refused: ${verdict}`);
    this.name = 'InviteCodeRefused';
  }
}

/** Attempts per address, right or wrong, before the check refuses outright */
const ATTEMPTS_PER_ADDRESS = 10;

type Runtime = PayloadRuntime | BasePayload;

/**
 * Count an attempt before anything slow runs. Counting only wrong guesses,
 * after scrypt, would let a burst of parallel requests all pass the gate
 * before the first of them is counted.
 */
const attempt = (attemptsKey: string): boolean =>
  rateLimit(attemptsKey, { limit: ATTEMPTS_PER_ADDRESS }).ok;

const signupOpen = async (
  payload: BasePayload,
  transactionID?: number | string
): Promise<boolean> => {
  const { docs } = await payload.find({
    collection: 'platform-settings',
    depth: 0,
    limit: 1,
    overrideAccess: true,
    req: transactionID === undefined ? undefined : { transactionID }
  });
  return docs[0]?.signupOpen === true;
};

const findCode = async (
  payload: BasePayload,
  lookup: string,
  transactionID?: number | string
) => {
  const { docs } = await payload.find({
    collection: 'invite-codes',
    where: { lookup: { equals: lookup } },
    depth: 0,
    limit: 1,
    // `codeHash` is unreadable over the API; only an override sees it
    overrideAccess: true,
    req: transactionID === undefined ? undefined : { transactionID }
  });
  return docs[0] ?? null;
};

/**
 * Parse the code, find it and verify its secret.
 *
 * The secret is always derived, against a dummy when nothing matched, so a
 * caller cannot time whether the lookup half exists.
 */
const resolveCode = async (
  payload: BasePayload,
  input: string | null | undefined,
  transactionID?: number | string
) => {
  const parts = parseInviteCode(input);
  const doc = parts
    ? await findCode(payload, parts.lookup, transactionID)
    : null;
  const matches = await verifyInviteSecret(parts?.secret ?? '', doc?.codeHash);
  return matches ? doc : null;
};

/**
 * Whether a typed invite code would let someone sign up, for the signup page
 * to answer before anything is created.
 *
 * Every check counts an attempt against the address, before anything slow
 * runs, and an address over the limit is refused. `expired` and
 * `exhausted` are told only to someone holding the right secret, so lookups
 * cannot be enumerated.
 *
 * @param runtime - Payload runtime or instance
 * @param input - The code as typed
 * @param options - `attemptsKey`: `<client ip>:invite-code`
 */
export async function checkInviteCode(
  runtime: Runtime,
  input: string | null | undefined,
  options: { attemptsKey: string; now?: Date }
): Promise<InviteCodeVerdict> {
  const { payload } = mapToRuntime(runtime);
  const { attemptsKey, now = new Date() } = options;

  if (!(await signupOpen(payload))) {
    return 'closed';
  }
  if (!attempt(attemptsKey)) {
    return 'throttled';
  }

  const doc = await resolveCode(payload, input);
  if (!doc) {
    return 'unknown';
  }
  if (doc.expiresAt && new Date(doc.expiresAt) <= now) {
    return 'expired';
  }
  if ((doc.uses ?? 0) >= doc.maxUses) {
    return 'exhausted';
  }
  return 'valid';
}

const returnedRows = (result: unknown): number =>
  typeof result === 'object' &&
  result !== null &&
  'rows' in result &&
  Array.isArray(result.rows)
    ? result.rows.length
    : 0;

/**
 * Spend one use of an invite code inside the signup's transaction.
 *
 * Payload has no atomic increment, and a read-then-update lets two signups
 * race past `maxUses`. One conditional `UPDATE … RETURNING` decides instead:
 * it only touches a row that still has a use left and has not expired, so
 * of two concurrent signups for the last use exactly one gets a row back.
 * Anything else throws {@link InviteCodeRefused}, which rolls the signup back.
 *
 * @param runtime - Payload runtime or instance
 * @param input - The code as typed
 * @param options - `transactionID`: the signup's transaction; `attemptsKey`: `<client ip>:invite-code`
 * @returns The id of the code that was spent
 */
export async function consumeInviteCode(
  runtime: Runtime,
  input: string | null | undefined,
  options: { transactionID: number | string; attemptsKey: string }
): Promise<number> {
  const { payload } = mapToRuntime(runtime);
  const { transactionID, attemptsKey } = options;

  if (!(await signupOpen(payload, transactionID))) {
    throw new InviteCodeRefused('closed');
  }
  // The same gate as the check, so calling this directly is no way around it
  if (!attempt(attemptsKey)) {
    throw new InviteCodeRefused('throttled');
  }
  const doc = await resolveCode(payload, input, transactionID);
  if (!doc) {
    throw new InviteCodeRefused('unknown');
  }

  const adapter = payload.db as unknown as PostgresAdapter;
  const codes = adapter.tables?.['invite_codes'];
  const db = adapter.sessions?.[String(transactionID)]?.db;
  if (!codes || !db) {
    // Outside the signup's transaction the spent use could outlive a failed signup
    throw new Error(
      'consumeInviteCode needs the invite_codes table and an open transaction'
    );
  }

  // Postgres refuses a qualified column as the target of SET, so those two
  // are named on their own; everywhere else the qualified form is fine
  const result = await adapter.execute({
    db,
    sql: sql`update ${codes}
      set ${sql.identifier(codes.uses.name)} = coalesce(${codes.uses}, 0) + 1,
        ${sql.identifier(codes.updatedAt.name)} = now()
      where ${codes.id} = ${doc.id}
        and coalesce(${codes.uses}, 0) < ${codes.maxUses}
        and (${codes.expiresAt} is null or ${codes.expiresAt} > now())
      returning ${codes.id}`
  });

  if (returnedRows(result) !== 1) {
    throw new InviteCodeRefused(
      doc.expiresAt && new Date(doc.expiresAt) <= new Date()
        ? 'expired'
        : 'exhausted'
    );
  }
  return doc.id;
}
