/**
 * Turning the cms script's report into something a person reads.
 *
 * The report shape is restated here rather than imported from
 * `@codeware/app-cms/feature/seed`: importing it would pull Payload into the
 * CLI, which is the very thing running the work in a subprocess avoids.
 */

export type AppliedOutcome = {
  collection: string;
  identifier: string;
  action: 'created' | 'existed';
};

export type UnresolvedReference = {
  blockType: string;
  field: string;
  lookup: string;
};

export type ApplyReport = {
  tenant: { slug: string; id: number };
  dryRun: boolean;
  outcomes: Array<AppliedOutcome>;
  unresolved: Array<UnresolvedReference>;
};

/** Reads the report the script printed, or says the run produced none. */
export function parseApplyReport(stdout: string): ApplyReport {
  const line = stdout.match(/^APPLY_REPORT=(.+)$/m)?.[1];

  if (!line) {
    throw new Error('The apply script reported no result');
  }

  const report = JSON.parse(line) as ApplyReport;

  if (!report?.tenant?.slug || !Array.isArray(report.outcomes)) {
    throw new Error('The apply script reported something unreadable');
  }

  return report;
}

/** How many of each collection would be created, and how many already exist. */
export function countByCollection(
  outcomes: Array<AppliedOutcome>
): Array<{ collection: string; created: number; existed: number }> {
  const counts = new Map<string, { created: number; existed: number }>();

  for (const { collection, action } of outcomes) {
    const entry = counts.get(collection) ?? { created: 0, existed: 0 };
    entry[action] += 1;
    counts.set(collection, entry);
  }

  return [...counts.entries()].map(([collection, entry]) => ({
    collection,
    ...entry
  }));
}

/** One line per collection, saying what the apply would do to it. */
export function planSteps(report: ApplyReport): Array<string> {
  const steps = countByCollection(report.outcomes).map(
    ({ collection, created, existed }) => {
      const parts: Array<string> = [];
      if (created) parts.push(`${created} to create`);
      if (existed) parts.push(`${existed} already there`);
      return `${collection}: ${parts.join(', ')}`;
    }
  );

  return steps.length ? steps : ['Nothing to apply'];
}

/**
 * What still has to be said after the plan.
 *
 * An unresolved reference is the failure this whole path exists to prevent — a
 * page published without its image, reported only in a log nobody reads. It
 * refuses the apply rather than warning about it.
 */
export function planNotes(report: ApplyReport): Array<string> {
  const notes: Array<string> = [];

  if (report.unresolved.length) {
    notes.push(
      `${report.unresolved.length} reference(s) lead nowhere, so nothing will be written:`
    );
    for (const { blockType, field, lookup } of report.unresolved) {
      notes.push(`  ${blockType}.${field} → '${lookup}'`);
    }
  }

  notes.push(
    'The plan above was produced by applying the definition and rolling it back, so Payload has already validated every field.'
  );

  return notes;
}

/** True when the plan found nothing worth applying. */
export function nothingToApply(report: ApplyReport): boolean {
  return report.outcomes.every(({ action }) => action === 'existed');
}

export function resultSummary(report: ApplyReport): {
  summary: string;
  details: Array<string>;
} {
  const created = report.outcomes.filter(
    ({ action }) => action === 'created'
  ).length;

  return {
    summary: report.dryRun
      ? `Nothing was written to '${report.tenant.slug}'`
      : `Applied to '${report.tenant.slug}': ${created} document(s) created`,
    details: planSteps(report)
  };
}
