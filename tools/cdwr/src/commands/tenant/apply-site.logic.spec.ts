import { describe, expect, it } from 'vitest';

import {
  type ApplyReport,
  countByCollection,
  extraMeaning,
  nothingToApply,
  parseApplyReport,
  planNotes,
  planSteps,
  resultSummary
} from './apply-site.logic';

const report = (overrides: Partial<ApplyReport> = {}): ApplyReport => ({
  tenant: { slug: 'moon', id: 1 },
  dryRun: true,
  outcomes: [],
  unresolved: [],
  extra: [],
  fresh: false,
  removed: [],
  kept: [],
  ...overrides
});

describe('parseApplyReport', () => {
  it('reads the report off the script output', () => {
    const stdout = [
      '[APPLY] 1 document(s), rolled back',
      `APPLY_REPORT=${JSON.stringify(report())}`
    ].join('\n');

    expect(parseApplyReport(stdout).tenant.slug).toBe('moon');
  });

  it('says so when the script reported nothing', () => {
    // Otherwise a script that died mid-run reads as a clean no-op
    expect(() => parseApplyReport('[APPLY] started\n')).toThrow(
      /reported no result/
    );
  });

  it('says so when the report is not the shape expected', () => {
    expect(() => parseApplyReport('APPLY_REPORT={"tenant":{}}')).toThrow(
      /unreadable/
    );
  });
});

describe('countByCollection', () => {
  it('separates what would be created from what is already there', () => {
    const counts = countByCollection([
      { collection: 'pages', identifier: 'home', action: 'created' },
      { collection: 'pages', identifier: 'about', action: 'created' },
      { collection: 'pages', identifier: 'contact', action: 'existed' },
      { collection: 'tags', identifier: 'news', action: 'existed' }
    ]);

    expect(counts).toEqual([
      { collection: 'pages', created: 2, existed: 1 },
      { collection: 'tags', created: 0, existed: 1 }
    ]);
  });
});

describe('planSteps', () => {
  it('says what happens to each collection', () => {
    const steps = planSteps(
      report({
        outcomes: [
          { collection: 'pages', identifier: 'home', action: 'created' },
          { collection: 'pages', identifier: 'about', action: 'existed' }
        ]
      })
    );

    expect(steps).toEqual(['pages: 1 to create, 1 already there']);
  });

  it('says so rather than showing an empty plan', () => {
    expect(planSteps(report())).toEqual(['Nothing to apply']);
  });
});

describe('planNotes', () => {
  it('lists every reference that leads nowhere', () => {
    const notes = planNotes(
      report({
        unresolved: [
          { blockType: 'hero', field: 'media', lookup: 'absent.png' },
          { blockType: 'file-area', field: 'tags', lookup: 'gone' }
        ]
      })
    );

    expect(notes[0]).toContain('2 reference(s) lead nowhere');
    expect(notes).toContain("  hero.media → 'absent.png'");
    expect(notes).toContain("  file-area.tags → 'gone'");
  });

  it('always says the plan came from a real, rolled-back write', () => {
    // The plan is exact rather than a guess, and a reader should know why
    expect(planNotes(report()).join(' ')).toContain('rolling it back');
  });
});

describe('nothingToApply', () => {
  it('is true when every document is already there', () => {
    expect(
      nothingToApply(
        report({
          outcomes: [
            { collection: 'pages', identifier: 'home', action: 'existed' }
          ]
        })
      )
    ).toBe(true);
  });

  it('is false when something would be created', () => {
    expect(
      nothingToApply(
        report({
          outcomes: [
            { collection: 'pages', identifier: 'home', action: 'created' }
          ]
        })
      )
    ).toBe(false);
  });
});

describe('resultSummary', () => {
  it('does not claim a write when the run rolled back', () => {
    const { summary } = resultSummary(
      report({
        dryRun: true,
        outcomes: [
          { collection: 'pages', identifier: 'home', action: 'created' }
        ]
      })
    );

    expect(summary).toContain('Nothing was written');
  });

  it('counts what was created when it committed', () => {
    const { summary } = resultSummary(
      report({
        dryRun: false,
        outcomes: [
          { collection: 'pages', identifier: 'home', action: 'created' },
          { collection: 'pages', identifier: 'about', action: 'existed' }
        ]
      })
    );

    expect(summary).toBe("Applied to 'moon': 1 document(s) created");
  });
});

describe('extraMeaning', () => {
  const extra = {
    collection: 'pages',
    identifier: 'dropped',
    id: 1,
    managedBy: null
  } as const;

  it('says a dropped page of this definition is its own', () => {
    expect(
      extraMeaning({ ...extra, managedBy: 'cdwr.io', owner: 'this-definition' })
    ).toBe('created by this definition, since dropped from it');
  });

  it('names the other definition that owns it', () => {
    expect(
      extraMeaning({ ...extra, managedBy: 'moon', owner: 'another-definition' })
    ).toBe("created by the definition 'moon'");
  });

  it("says a document no apply created is an editor's", () => {
    expect(extraMeaning({ ...extra, owner: 'nobody' })).toBe(
      'not created by any apply — an editor wrote it'
    );
  });
});

describe('a fresh apply', () => {
  const fresh = report({
    fresh: true,
    removed: [
      { collection: 'pages', identifier: 'home', id: 1 },
      { collection: 'pages', identifier: 'dropped', id: 2 },
      { collection: 'tags', identifier: 'old-tag', id: 3 }
    ],
    outcomes: [
      { collection: 'pages', identifier: 'home', action: 'created' },
      { collection: 'pages', identifier: 'written-by-hand', action: 'existed' },
      { collection: 'site-settings', identifier: 'moon', action: 'existed' }
    ],
    // As the engine reports it: owned collections only
    kept: [
      { collection: 'pages', identifier: 'written-by-hand', action: 'existed' }
    ]
  });

  it('shows what it removes beside what it creates, per collection', () => {
    expect(planSteps(fresh)).toEqual([
      'pages: 2 to remove, 1 to create, 1 already there',
      'site-settings: 1 already there',
      // Only emptied, never recreated — it still has to appear in the plan
      'tags: 1 to remove'
    ]);
  });

  it('names each document it could not replace, and why', () => {
    const notes = planNotes(fresh).join('\n');

    expect(notes).toContain(
      '1 document(s) the definition names were not created by it'
    );
    expect(notes).toContain('  pages: written-by-hand');
  });

  it('never lists the one-per-tenant documents as kept', () => {
    expect(planNotes(fresh).join('\n')).not.toContain('site-settings: moon');
  });

  it('says nothing of kept documents on an ordinary apply', () => {
    const notes = planNotes({ ...fresh, fresh: false, kept: [] }).join('\n');

    expect(notes).not.toContain('were not created by it');
  });

  it('is never nothing to apply while it has something to remove', () => {
    expect(
      nothingToApply(
        report({
          fresh: true,
          removed: [{ collection: 'pages', identifier: 'home', id: 1 }],
          outcomes: [
            { collection: 'pages', identifier: 'home', action: 'existed' }
          ]
        })
      )
    ).toBe(false);
  });

  it('counts what it removed in the summary', () => {
    expect(resultSummary({ ...fresh, dryRun: false }).summary).toBe(
      "Applied to 'moon': 3 removed, 1 document(s) created"
    );
  });
});
