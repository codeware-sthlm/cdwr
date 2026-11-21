import { describe, expect, it } from 'vitest';

import {
  type ApplyReport,
  countByCollection,
  extraMeaning,
  freshDanger,
  metaLines,
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
      { collection: 'pages', created: 2, existed: 1, updated: 0 },
      { collection: 'tags', created: 0, existed: 1, updated: 0 }
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

  it('counts the kept landing page as an update', () => {
    const steps = planSteps(
      report({
        outcomes: [
          { collection: 'pages', identifier: 'home', action: 'updated' }
        ]
      })
    );

    expect(steps).toEqual(['pages: 1 to update']);
  });

  it('says so rather than showing an empty plan', () => {
    expect(planSteps(report())).toEqual(['Nothing to apply']);
  });
});

describe('planNotes', () => {
  it('names the meta a rewritten landing page gets', () => {
    const notes = planNotes(
      report({
        outcomes: [
          {
            collection: 'pages',
            identifier: 'home',
            action: 'updated',
            meta: { stated: { title: 'Home' }, current: { title: 'Old' } }
          }
        ]
      })
    );

    expect(notes).toContain(
      "SEO meta, pages/home: will write title 'Home' over title 'Old'"
    );
  });

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
  it('is false when a fresh apply rewrites the kept landing page', () => {
    expect(
      nothingToApply(
        report({
          outcomes: [
            { collection: 'pages', identifier: 'home', action: 'updated' }
          ]
        })
      )
    ).toBe(false);
  });

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

  it('does not claim an editor wrote what may only predate the record', () => {
    expect(extraMeaning({ ...extra, owner: 'nobody' })).toBe(
      'no apply recorded — written in the admin, or older than the record'
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

  it('says what recreating costs a live site', () => {
    const notes = planNotes(fresh).join('\n');

    expect(notes).toContain(
      'A fresh apply recreates pages: their ids change, admin edits to them are replaced, and a custom component renders nothing until it is rebuilt.'
    );
    // Tags are reused: a dropped one is gone, never recreated
    expect(notes).toContain(
      'What the definition dropped from tags is deleted, not recreated.'
    );
  });

  it('says nothing of recreating when nothing is removed', () => {
    expect(planNotes(report()).join('\n')).not.toContain('recreates');
  });

  it('confirms as destructive outside development only', () => {
    expect(freshDanger('production', true)).toBe('destructive');
    expect(freshDanger('preview', true)).toBe('destructive');
    expect(freshDanger('development', true)).toBeUndefined();
    expect(freshDanger('production', false)).toBeUndefined();
  });

  it('counts what it removed in the summary', () => {
    expect(resultSummary({ ...fresh, dryRun: false }).summary).toBe(
      "Applied to 'moon': 3 removed, 1 document(s) created"
    );
  });
});

describe('metaLines', () => {
  it('says what a created page will get', () => {
    expect(
      metaLines([
        {
          collection: 'pages',
          identifier: 'home',
          action: 'created',
          meta: { stated: { title: 'Home', description: 'Welcome' } }
        }
      ])
    ).toEqual([
      {
        collection: 'pages',
        identifier: 'home',
        text: "will write title 'Home', description 'Welcome'"
      }
    ]);
  });

  it('says how an existing page differs from the definition', () => {
    expect(
      metaLines([
        {
          collection: 'pages',
          identifier: 'home',
          action: 'existed',
          meta: { stated: { title: 'Home' }, current: { title: 'Old' } }
        }
      ])[0].text
    ).toBe("definition says title 'Home'; tenant has title 'Old'");
  });

  it('skips outcomes without meta news', () => {
    expect(
      metaLines([
        { collection: 'pages', identifier: 'home', action: 'existed' }
      ])
    ).toEqual([]);
  });

  it('puts the meta a fresh apply writes in the plan notes', () => {
    const notes = planNotes(
      report({
        outcomes: [
          {
            collection: 'pages',
            identifier: 'home',
            action: 'created',
            meta: { stated: { title: 'Home' } }
          }
        ]
      })
    );

    expect(notes).toContain("SEO meta, pages/home: will write title 'Home'");
  });
});
