import { describe, expect, it } from 'vitest';

import {
  type ApplyReport,
  countByCollection,
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
