import { z } from 'zod';

import { APPS, summarize } from '../infisical/analysis.logic';

import type { Database } from './supabase.types';

/** The row for what belongs to no tenant: the host apps and the database */
export const SHARED_KEY = '_shared';

export type TenantStateRow =
  Database['public']['Tables']['tenant_state']['Insert'];

/** What one read gave: its value, or a one-line reason it gave none (never "none found") */
export type Reading<T> = { ok: true; value: T } | { ok: false; reason: string };

export const ok = <T>(value: T): Reading<T> => ({ ok: true, value });

/**
 * One line, short, with anything shaped like a url (a connection string with a
 * password) removed: an error message ends up in a table the desk shows.
 */
export const oneLine = (error: unknown): string => {
  const text = error instanceof Error ? error.message : String(error);
  return (
    text
      .replace(/[a-z][a-z0-9+.-]*:\/\/\S*/gi, '[url]')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 200) || 'unknown error'
  );
};

export const failed = (error: unknown): Reading<never> => ({
  ok: false,
  reason: oneLine(error)
});

// --- the database read ---

const SqlSchema = z.object({
  tenants: z.array(
    z.object({
      slug: z.string(),
      name: z.string().nullable(),
      deployment: z.string().nullable(),
      status: z.string().nullable(),
      domains: z.array(
        z.object({
          hostname: z.string(),
          app: z.string().nullable(),
          primary: z.boolean(),
          certificateStatus: z.string().nullable()
        })
      )
    })
  ),
  db: z.object({
    sizeBytes: z.number().nullable(),
    sessions: z.number(),
    byApplication: z.record(z.string(), z.number())
  })
});

export type TenantRecord = z.infer<typeof SqlSchema>['tenants'][number];
export type DbRecord = z.infer<typeof SqlSchema>['db'];

/** What `platform.sql` printed; throws without echoing any of it */
export const parseSql = (
  stdout: string
): { tenants: TenantRecord[]; db: DbRecord } => {
  try {
    return SqlSchema.parse(JSON.parse(stdout.trim()));
  } catch {
    throw new Error('psql did not print the expected JSON');
  }
};

// --- the fly and health reads ---

/** The part of a Fly machine that is read; the rest of it is never looked at */
export type MachineInput = {
  id: string;
  state: string;
  region: string;
  imageRef?: { repository?: string; tag?: string };
  config?: {
    env?: Record<string, string>;
    guest?: { memory_mb?: number };
  };
};

export type CertInput = { hostname: string; clientStatus: string };

export type HealthInput = {
  ok: boolean;
  status: number | null;
  ms: number;
  error?: string;
};

export type FlyAppReading = {
  name: string;
  machines: Reading<MachineInput[]>;
  certs: Reading<CertInput[]>;
  health: HealthInput;
};

export type SwitchRecord = {
  app: string;
  environment: string;
  tenant: string | null;
  flag: string;
};

/** A deployed commit; anything else in `GIT_SHA` is not taken */
const SHA = /^[0-9a-f]{7,40}$/;

const machineState = (m: MachineInput) => ({
  id: m.id,
  state: m.state,
  region: m.region,
  memoryMb: m.config?.guest?.memory_mb ?? null,
  image: m.imageRef?.repository
    ? m.imageRef.tag
      ? `${m.imageRef.repository}:${m.imageRef.tag}`
      : m.imageRef.repository
    : null,
  sha: SHA.test(m.config?.env?.['GIT_SHA'] ?? '')
    ? (m.config?.env?.['GIT_SHA'] ?? null)
    : null
});

const appState = (reading: FlyAppReading, kind: string) => ({
  app: reading.name,
  kind,
  machines: reading.machines.ok
    ? reading.machines.value.map(machineState)
    : null,
  certs: reading.certs.ok
    ? reading.certs.value.map((c) => ({
        hostname: c.hostname,
        state: c.clientStatus
      }))
    : null,
  health: {
    ok: reading.health.ok,
    status: reading.health.status,
    ms: reading.health.ms
  }
});

type AppState = ReturnType<typeof appState>;

/**
 * What a Fly app is: `cdwr-<app>` is a host app and `cdwr-<app>-<tenant>` a
 * tenant's, the suffix being the tenant's deployment name (or slug). A host app
 * and an app of no known tenant belong to the shared row; with the tenants
 * unread, a suffixed app can't be placed and is left out.
 */
export const appOwner = (
  app: string,
  tenants: TenantRecord[] | null
): { key: string; kind: string } | null => {
  for (const base of APPS) {
    const prefix = `cdwr-${base}`;
    if (app === prefix) return { key: SHARED_KEY, kind: base };
    if (app.startsWith(`${prefix}-`)) {
      if (!tenants) return null;
      const suffix = app.slice(prefix.length + 1);
      const tenant = tenantOf(suffix, tenants);
      return { key: tenant?.slug ?? SHARED_KEY, kind: base };
    }
  }
  return { key: SHARED_KEY, kind: 'other' };
};

const tenantOf = (
  name: string,
  tenants: TenantRecord[]
): TenantRecord | undefined =>
  tenants.find((t) => t.deployment === name) ??
  tenants.find((t) => t.slug === name);

/** The deploy switches as the tenancy lib reports them, named fields only */
export const switchRecords = (
  environment: string,
  deployments: Parameters<typeof summarize>[1],
  skipped: Parameters<typeof summarize>[2]
): SwitchRecord[] => {
  const records: SwitchRecord[] = [];
  const analysis = summarize(
    environment as Parameters<typeof summarize>[0],
    deployments,
    skipped,
    {}
  );
  for (const { app, host, tenants } of analysis.apps) {
    if (host !== null) {
      records.push({ app, environment, tenant: null, flag: host });
    }
    for (const { tenant, flag } of tenants) {
      records.push({ app, environment, tenant, flag });
    }
  }
  return records;
};

// --- the rows ---

export interface PlatformReadings {
  at: string;
  tenants: Reading<TenantRecord[]>;
  /** Comes from the same query as the tenants */
  db: Reading<DbRecord>;
  fly: Reading<FlyAppReading[]>;
  switches: Reading<SwitchRecord[]>;
}

type Errors = Record<string, string>;

const note = (errors: Errors, source: string, reason: string): void => {
  errors[source] = errors[source] ? `${errors[source]}; ${reason}` : reason;
};

const certificateOf = (
  hostname: string,
  apps: AppState[],
  flyRead: boolean
): string => {
  if (!flyRead) return 'unknown';
  for (const app of apps) {
    const found = app.certs?.find((c) => c.hostname === hostname);
    if (found) return found.state;
  }
  return apps.some((app) => app.certs === null) ? 'unknown' : 'missing';
};

/**
 * One row per tenant plus the shared row, from what was read. A failed read
 * leaves an entry under its source name in `errors` of every row it would have
 * filled, so an empty list never reads as "none". The rows are built field by
 * field: nothing a source returns is spread into one.
 */
export const buildRows = (
  readings: PlatformReadings
): { rows: TenantStateRow[]; prune: string[] | null } => {
  const { at, tenants, db, fly, switches } = readings;
  const known = tenants.ok ? tenants.value : null;

  const errors = new Map<string, Errors>();
  const errorsOf = (key: string): Errors => {
    let own = errors.get(key);
    if (!own) errors.set(key, (own = {}));
    return own;
  };
  const apps = new Map<string, AppState[]>();
  const switchList = new Map<string, SwitchRecord[]>();

  // Failures of a whole source show on every row it feeds
  const keys = [...(known?.map((t) => t.slug) ?? []), SHARED_KEY];
  for (const key of keys) errorsOf(key);
  if (!tenants.ok) note(errorsOf(SHARED_KEY), 'tenants', tenants.reason);
  if (!db.ok) note(errorsOf(SHARED_KEY), 'db', db.reason);
  if (!fly.ok) for (const key of keys) note(errorsOf(key), 'fly', fly.reason);
  if (!switches.ok) {
    for (const key of keys) note(errorsOf(key), 'switches', switches.reason);
  }

  if (fly.ok) {
    for (const reading of fly.value) {
      const owner = appOwner(reading.name, known);
      if (!owner) continue;
      const own = errorsOf(owner.key);
      if (!reading.machines.ok) {
        note(own, 'fly', `${reading.name}: ${reading.machines.reason}`);
      }
      if (!reading.certs.ok) {
        note(own, 'certs', `${reading.name}: ${reading.certs.reason}`);
      }
      apps.set(owner.key, [
        ...(apps.get(owner.key) ?? []),
        appState(reading, owner.kind)
      ]);
    }
  }

  if (switches.ok) {
    for (const record of switches.value) {
      // A tenant's switch can't be placed while the tenants are unread
      if (record.tenant !== null && !known) continue;
      const tenant =
        record.tenant !== null && known
          ? tenantOf(record.tenant, known)
          : undefined;
      const key = tenant?.slug ?? SHARED_KEY;
      switchList.set(key, [...(switchList.get(key) ?? []), record]);
    }
  }

  const switchState = (key: string) =>
    (switchList.get(key) ?? []).map((s) => ({
      app: s.app,
      environment: s.environment,
      tenant: s.tenant,
      flag: s.flag
    }));

  const rows: TenantStateRow[] = (known ?? [])
    .slice()
    .sort((a, b) => a.slug.localeCompare(b.slug))
    .map((t) => {
      const own = apps.get(t.slug) ?? [];
      return {
        key: t.slug,
        at,
        name: t.name,
        deployment: t.deployment,
        status: t.status,
        apps: own,
        domains: t.domains.map((d) => ({
          hostname: d.hostname,
          app: d.app,
          primary: d.primary,
          certificate: certificateOf(d.hostname, own, fly.ok),
          recordedCertificate: d.certificateStatus
        })),
        switches: switchState(t.slug),
        db: {},
        errors: errorsOf(t.slug)
      };
    });

  rows.push({
    key: SHARED_KEY,
    at,
    name: null,
    deployment: null,
    status: null,
    apps: apps.get(SHARED_KEY) ?? [],
    domains: [],
    switches: switchState(SHARED_KEY),
    db: db.ok
      ? {
          sizeBytes: db.value.sizeBytes,
          sessions: db.value.sessions,
          byApplication: Object.fromEntries(
            Object.entries(db.value.byApplication)
          )
        }
      : {},
    errors: errorsOf(SHARED_KEY)
  });

  // A vanished tenant's row goes only when the tenants were read: a failed read is not "none"
  return { rows, prune: known ? rows.map((r) => r.key) : null };
};

/** The value of PostgREST's `key=` filter that selects the rows whose key is none of `keep` */
export const vanishedFilter = (keep: string[]): string =>
  `not.in.(${keep
    .map((k) => `"${k.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`)
    .join(',')})`;

/** The one query's reading as the two readings `buildRows` takes */
export const splitDatabase = (
  reading: Reading<{ tenants: TenantRecord[]; db: DbRecord }>
): { tenants: Reading<TenantRecord[]>; db: Reading<DbRecord> } =>
  reading.ok
    ? {
        tenants: ok(reading.value.tenants),
        db: ok(reading.value.db)
      }
    : { tenants: reading, db: reading };
