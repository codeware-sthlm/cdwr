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

/** Who put an extra document there — the engine's `ExtraOwner`, restated. */
export type ExtraOwner = 'this-definition' | 'another-definition' | 'nobody';

/** A document the tenant holds that the definition does not name. */
export type ExtraDocument = {
  collection: string;
  identifier: string;
  id: number;
  /** The definition that created it, or `null` when none did */
  managedBy: string | null;
  owner: ExtraOwner;
};

/**
 * What an extra document means, in the words `diff-site` prints.
 *
 * Exhaustive by type, so an owner added to the engine's union and restated
 * here cannot fall through to a blank column.
 */
export function extraMeaning(extra: ExtraDocument): string {
  switch (extra.owner) {
    case 'this-definition':
      return 'created by this definition, since dropped from it';
    case 'another-definition':
      return `created by the definition '${extra.managedBy}'`;
    case 'nobody':
      return 'not created by any apply — an editor wrote it';
  }
}

/** A document a fresh apply removed first — the engine's `RemovedDocument`, restated. */
export type RemovedDocument = {
  collection: string;
  identifier: string;
  id: number;
};

export type ApplyReport = {
  tenant: { slug: string; id: number };
  dryRun: boolean;
  outcomes: Array<AppliedOutcome>;
  unresolved: Array<UnresolvedReference>;
  extra: Array<ExtraDocument>;
  /** Whether the definition's own documents were removed before applying */
  fresh: boolean;
  /** What a fresh apply removed first; empty otherwise */
  removed: Array<RemovedDocument>;
  /** Named by the definition but not created by it, so a fresh apply left it */
  kept: Array<AppliedOutcome>;
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
  const removedBy = new Map<string, number>();
  for (const { collection } of report.removed) {
    removedBy.set(collection, (removedBy.get(collection) ?? 0) + 1);
  }

  const counted = countByCollection(report.outcomes);
  // A collection the fresh apply only emptied still has to show up
  for (const collection of removedBy.keys()) {
    if (!counted.some((entry) => entry.collection === collection)) {
      counted.push({ collection, created: 0, existed: 0 });
    }
  }

  const steps = counted.map(({ collection, created, existed }) => {
    const parts: Array<string> = [];
    const removed = removedBy.get(collection);
    if (removed) parts.push(`${removed} to remove`);
    if (created) parts.push(`${created} to create`);
    if (existed) parts.push(`${existed} already there`);
    return `${collection}: ${parts.join(', ')}`;
  });

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

  // A fresh apply removes only what this definition created, so anything
  // still found was not its to remove — an editor's, or from before
  // `managedBy` existed. Name each one: it is why the tenant will not match
  const { kept } = report;
  if (kept.length) {
    notes.push(
      `${kept.length} document(s) the definition names were not created by it, so they are left as they are:`
    );
    for (const { collection, identifier } of kept) {
      notes.push(`  ${collection}: ${identifier}`);
    }
    notes.push(
      '  Delete them once, or reseed, and the next fresh apply replaces them.'
    );
  }

  notes.push(
    'The plan above was produced by applying the definition and rolling it back, so Payload has already validated every field.'
  );

  return notes;
}

/** True when the plan found nothing worth applying. */
export function nothingToApply(report: ApplyReport): boolean {
  return (
    report.removed.length === 0 &&
    report.outcomes.every(({ action }) => action === 'existed')
  );
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
      : `Applied to '${report.tenant.slug}': ${
          report.fresh ? `${report.removed.length} removed, ` : ''
        }${created} document(s) created`,
    details: planSteps(report)
  };
}
