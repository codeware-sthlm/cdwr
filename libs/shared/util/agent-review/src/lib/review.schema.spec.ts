import {
  findingId,
  reviewFileSchema,
  reviewSchema,
  toReview
} from './review.schema';

const valid = () => ({
  brief: 'Two tickets wait on you.',
  actions: [
    {
      ticket: 'COD-1',
      action: 'Merge the pull request',
      why: 'Checks are green',
      evidence: ['PR #1']
    }
  ],
  findings: [
    {
      id: 'missing-plan:COD-2:0123abcd',
      ticket: 'COD-2',
      kind: 'Missing plan',
      severity: 'blocks' as const,
      evidence: ['No plan comment'],
      fix: 'Write the plan'
    }
  ],
  stale: [{ ticket: 'COD-3', why: 'Idle for a month', evidence: [] }],
  suggestions: [{ ticket: 'COD-4', why: 'Small and ready' }]
});

describe('reviewSchema', () => {
  it('parses a valid review', () => {
    expect(reviewSchema.safeParse(valid()).success).toBe(true);
  });

  it('fails when a field is missing', () => {
    const { brief: _brief, ...rest } = valid();
    expect(reviewSchema.safeParse(rest).success).toBe(false);
  });

  it('fails with more than three suggestions', () => {
    const review = valid();
    review.suggestions = Array.from({ length: 4 }, () => ({
      ticket: 'COD-4',
      why: 'Why'
    }));
    expect(reviewSchema.safeParse(review).success).toBe(false);
  });

  it('fails with more than seven actions', () => {
    const review = valid();
    review.actions = Array.from({ length: 8 }, () => review.actions[0]!);
    expect(reviewSchema.safeParse(review).success).toBe(false);
  });

  it('fails an id of the wrong format', () => {
    const review = valid();
    review.findings[0]!.id = 'missing-plan:COD-2:xyz';
    expect(reviewSchema.safeParse(review).success).toBe(false);
  });

  it('fails an id whose ticket differs from the finding', () => {
    const review = valid();
    review.findings[0]!.id = 'missing-plan:COD-9:0123abcd';
    expect(reviewSchema.safeParse(review).success).toBe(false);
  });
});

describe('findingId', () => {
  it('is stable and matches the id format', () => {
    const id = findingId('Missing plan!', 'COD-2', 'No plan comment');
    expect(id).toBe(findingId('Missing plan!', 'COD-2', 'No plan comment'));
    expect(id).toMatch(/^[a-z0-9-]+:COD-\d+:[0-9a-f]{8}$/);
    expect(id.startsWith('missing-plan:COD-2:')).toBe(true);
  });

  it('differs with the text', () => {
    expect(findingId('a', 'COD-1', 'x')).not.toBe(findingId('a', 'COD-1', 'y'));
  });
});

const file = () => {
  const { findings: _findings, ...rest } = valid();
  return {
    ...rest,
    findings: [
      {
        ticket: 'COD-2',
        kind: 'Missing plan',
        key: 'COD-621',
        severity: 'blocks' as const,
        evidence: ['No plan comment'],
        fix: 'Write the plan'
      }
    ]
  };
};

describe('toReview', () => {
  it('turns a valid file into a valid review', () => {
    const parsed = reviewFileSchema.parse(file());
    const review = toReview(parsed);
    expect(review.findings[0]?.id).toBe(
      findingId('missing-plan', 'COD-2', 'COD-621')
    );
    expect(review.findings[0]?.kind).toBe('missing-plan');
    expect(reviewSchema.safeParse(review).success).toBe(true);
  });

  it('keeps ids stable whatever the evidence and fix wording', () => {
    const a = file();
    const b = file();
    b.findings[0]!.kind = 'missing_plan';
    b.findings[0]!.evidence = ['Reworded'];
    b.findings[0]!.fix = 'Another fix';
    const idA = toReview(reviewFileSchema.parse(a)).findings[0]?.id;
    const idB = toReview(reviewFileSchema.parse(b)).findings[0]?.id;
    expect(idA).toBe(idB);
  });

  it('gives another key another id', () => {
    const b = file();
    b.findings[0]!.key = 'COD-622';
    expect(toReview(reviewFileSchema.parse(b)).findings[0]?.id).not.toBe(
      toReview(reviewFileSchema.parse(file())).findings[0]?.id
    );
  });

  it('drops a duplicate id, the first wins', () => {
    const f = file();
    f.findings.push({ ...f.findings[0]!, fix: 'Second' });
    const review = toReview(reviewFileSchema.parse(f));
    expect(review.findings).toHaveLength(1);
    expect(review.findings[0]?.fix).toBe('Write the plan');
  });

  it('requires a key', () => {
    const f = file();
    const { key: _key, ...noKey } = f.findings[0]!;
    expect(
      reviewFileSchema.safeParse({ ...f, findings: [noKey] }).success
    ).toBe(false);
  });

  it.each(['', '   ', '-', ' - '])('refuses the key %j', (key) => {
    const f = file();
    expect(
      reviewFileSchema.safeParse({
        ...f,
        findings: [{ ...f.findings[0]!, key }]
      }).success
    ).toBe(false);
  });
});
