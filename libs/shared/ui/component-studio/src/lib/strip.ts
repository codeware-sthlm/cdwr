import type { Badge } from '@codeware/shared/ui/shadcn/components/badge';
import { isTransientFailure } from '@codeware/shared/util/payload-utils';
import type { ComponentProps } from 'react';

import {
  type BuildStatus,
  type StudioBuild,
  canRebuild,
  isBuiltWithWarnings,
  isServingPrevious,
  shouldPoll,
  showsDiagnostics
} from './build-state';
import {
  type ActionResult,
  type Described,
  type Tone,
  describeAction
} from './last-action';

type BadgeVariant = NonNullable<ComponentProps<typeof Badge>['variant']>;

type BadgeSpec = { label: string; variant: BadgeVariant; tone: Tone };

const STATUS_BADGES = {
  pending: { label: 'Pending', variant: 'muted', tone: 'muted' },
  building: { label: 'Building', variant: 'muted', tone: 'muted' },
  ready: { label: 'Ready', variant: 'success', tone: 'ok' },
  failed: { label: 'Failed', variant: 'destructive', tone: 'error' }
} as const satisfies Record<BuildStatus, BadgeSpec>;

const WARNING_BADGE = {
  label: 'Ready with warnings',
  variant: 'warning',
  tone: 'warn'
} as const satisfies BadgeSpec;

const NOT_BUILT_BADGE = {
  label: 'Not built',
  variant: 'muted',
  tone: 'muted'
} as const satisfies BadgeSpec;

/** Worst last, so a strip takes the tone of its most serious part */
const TONE_ORDER = [
  'muted',
  'ok',
  'warn',
  'error'
] as const satisfies readonly Tone[];

export const worstTone = (tones: readonly Tone[]): Tone =>
  tones.reduce<Tone>(
    (worst, tone) =>
      TONE_ORDER.indexOf(tone) > TONE_ORDER.indexOf(worst) ? tone : worst,
    'muted'
  );

export const buildBadge = (build: StudioBuild | null): BadgeSpec => {
  if (!build) {
    return NOT_BUILT_BADGE;
  }
  return isBuiltWithWarnings(build)
    ? WARNING_BADGE
    : STATUS_BADGES[build.status];
};

export const shortHash = (hash: string | null): string | null =>
  hash ? hash.slice(0, 8) : null;

/** Local, readable, English; the stored value when it is not a date */
export const formatBuiltAt = (iso: string): string => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
};

const AGO_UNITS = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60]
] as const satisfies ReadonlyArray<[Intl.RelativeTimeFormatUnit, number]>;

/** `5 months ago`; `just now` under a minute; null when it is not a date */
export const formatAgo = (iso: string, now: number): string | null => {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) {
    return null;
  }
  const seconds = Math.max(0, Math.round((now - then) / 1000));
  const unit = AGO_UNITS.find(([, size]) => seconds >= size);
  return unit
    ? new Intl.RelativeTimeFormat('en', { numeric: 'always' }).format(
        -Math.floor(seconds / unit[1]),
        unit[0]
      )
    : 'just now';
};

const formatSeconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

/** The build in one line, for the row that is always there */
export const buildSummary = (build: StudioBuild | null): string => {
  if (!build) {
    return 'Not built yet. Saving starts a build.';
  }
  switch (build.status) {
    case 'pending':
      return build.stale
        ? 'Still queued; the build may have stalled.'
        : 'Queued, waiting for the build to start.';
    case 'building':
      return build.stale
        ? 'Still building; the build may have stalled.'
        : 'Building…';
    case 'ready':
      return isBuiltWithWarnings(build)
        ? 'The site serves this build, which has warnings.'
        : 'The site serves this build.';
    case 'failed':
      return `${
        isServingPrevious(build)
          ? 'The previous bundle is still served.'
          : 'There is no earlier bundle to serve.'
      } ${
        isTransientFailure(build.diagnostics)
          ? 'The build could not run; it is tried again every ten minutes.'
          : 'The source needs a fix before it builds.'
      }`;
  }
};

/** Which step the job reached and how long it took, when known */
export const buildMeta = (build: StudioBuild | null): string | null => {
  const parts = [
    build?.job?.step ?? null,
    build?.job?.durationMs != null ? formatSeconds(build.job.durationMs) : null
  ].filter((part) => part !== null);
  return parts.length > 0 ? parts.join(' · ') : null;
};

export type StripModel = {
  tone: Tone;
  badge: BadgeSpec;
  /** The build in one line */
  summary: string;
  /** Whether the build is queued or running */
  inFlight: boolean;
  /** When a ready build was built, as stored */
  builtAt: string | null;
  hash: string | null;
  /** Job step and duration, when known */
  meta: string | null;
  action: Described | null;
  /** Whether a rebuild would help: the build failed or has gone quiet */
  rebuildable: boolean;
  /** Whether the strip should open by itself */
  expand: boolean;
};

export const stripModel = (
  build: StudioBuild | null,
  last: ActionResult | null
): StripModel => {
  const badge = buildBadge(build);
  const action = last ? describeAction(last) : null;
  return {
    tone: worstTone([badge.tone, ...(action ? [action.tone] : [])]),
    badge,
    summary: buildSummary(build),
    inFlight: build ? shouldPoll(build.status) : false,
    builtAt: build?.status === 'ready' ? build.builtAt : null,
    hash: shortHash(build?.hash ?? null),
    meta: buildMeta(build),
    action,
    rebuildable: canRebuild(build),
    expand:
      (build?.status === 'failed' && showsDiagnostics(build)) ||
      action?.tone === 'error'
  };
};
