import { randomBytes } from 'node:crypto';

import { pullRequestOf } from '../../services/fly';
import type { TenantApp } from '../../services/infisical';

/** The secret both apps read to decide whether their site is closed */
export const GATE_KEY = 'SITE_GATE_PASSWORD';

/** Matches the cms env schema, which refuses to start the site below this */
export const MIN_PASSWORD_LENGTH = 12;

export type OnFly = 'missing' | 'set' | 'unreachable';

export interface AppState {
  app: string;
  secretPath: string;
  /** The password is stored in Infisical, so a deploy would set it again */
  inInfisical: boolean;
  flyApp: string;
  /** Whether the running app carries it, which is what closes the site */
  onFly: OnFly;
}

/** A password nobody has to invent, in the alphabet a url can carry */
export const generatePassword = (): string =>
  randomBytes(18).toString('base64url');

/** How an app's gate state reads in a plan or a note */
export const describeOnFly = (onFly: OnFly): string =>
  ({ missing: 'open', set: 'closed', unreachable: 'not deployed' })[onFly];

export const anyClosed = (states: AppState[]): boolean =>
  states.some(({ onFly }) => onFly === 'set');

export const anyStored = (states: AppState[]): boolean =>
  states.some(({ inInfisical }) => inInfisical);

/**
 * Pull request numbers carried by preview cms app names, deduplicated, with
 * the current branch's own pull request moved first when it is among them.
 */
export function pullRequestChoices(
  appNames: string[],
  current?: number
): number[] {
  const seen = new Set<number>();
  const numbers: number[] = [];
  for (const name of appNames) {
    const pr = pullRequestOf(name);
    if (pr !== undefined && !seen.has(pr)) {
      seen.add(pr);
      numbers.push(pr);
    }
  }
  if (current !== undefined && seen.has(current)) {
    return [current, ...numbers.filter((n) => n !== current)];
  }
  return numbers;
}

export interface PrChoice {
  value: string;
  label?: string;
  hint?: string;
}

/** The pull request numbers as select choices, plus the write-only option */
export function prChoices(numbers: number[]): PrChoice[] {
  return [
    ...numbers.map((n) => ({ value: String(n), label: `PR #${n}` })),
    {
      value: 'none',
      label: 'None of them',
      hint: 'write Infisical only, for the next deploy'
    }
  ];
}

/** The Fly app name for a tenant's app, or '' when preview has none to name */
export function targetFlyApp(
  environment: string,
  pullRequest: number | undefined,
  nameApp: () => string
): string {
  return environment === 'preview' && !pullRequest ? '' : nameApp();
}

/** The tenant select's hint: which of its apps are gated, if any */
export function tenantHint(apps: TenantApp[]): string {
  const names = apps.map(({ app }) => app);
  const gated = apps
    .filter(({ secrets }) => GATE_KEY in secrets)
    .map(({ app }) => app);
  return gated.length
    ? `${names.join(', ')} — gated: ${gated.join(', ')}`
    : `${names.join(', ')} — open`;
}
