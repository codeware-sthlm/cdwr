import { checkReview } from './review-check.logic';

const review = {
  brief: 'One ticket waits.',
  actions: [{ ticket: 'COD-1', action: 'Merge', why: 'Green', evidence: [] }],
  findings: [],
  stale: [],
  suggestions: []
};

const finding = {
  ticket: 'COD-2',
  kind: 'Missing plan',
  key: 'COD-621',
  severity: 'note',
  evidence: ['No plan'],
  fix: 'Write it'
};

describe('checkReview', () => {
  it('derives each finding id from kind, ticket and key', () => {
    const result = checkReview(
      JSON.stringify({ ...review, findings: [finding, { ...finding }] }),
      { host: 'mac' }
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.row.findings).toHaveLength(1);
      expect(result.row.findings[0]).toMatchObject({
        id: expect.stringMatching(/^missing-plan:COD-2:[0-9a-f]{8}$/),
        kind: 'missing-plan',
        key: 'COD-621'
      });
    }
  });

  it('refuses a finding without a key', () => {
    const { key: _key, ...noKey } = finding;
    expect(
      checkReview(JSON.stringify({ ...review, findings: [noKey] }), {
        host: 'mac'
      })
    ).toEqual({ ok: false, message: 'failed: findings.0.key: Required' });
  });

  it.each(['', '-'])('refuses the key %j', (key) => {
    expect(
      checkReview(
        JSON.stringify({ ...review, findings: [{ ...finding, key }] }),
        { host: 'mac' }
      ).ok
    ).toBe(false);
  });

  it.each([
    ['a JWT', 'token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJl'],
    ['an sk- key', 'uses sk-ant-api03-abcdef1234'],
    ['an sk_ key', 'uses sk_live_abcdef1234'],
    ['a private key', '-----BEGIN PRIVATE KEY-----'],
    ['a long hex run', `commit ${'a1b2c3d4e5'.repeat(4)}`],
    ['a long base64 run', `key ${'Ab1+/Cd2'.repeat(6)}`],
    ['a GitHub classic token', `token ghp_${'aB3d'.repeat(9)}`],
    ['a GitHub fine-grained token', `github_pat_${'11ABCDEFG0'.repeat(3)}`],
    ['a Slack token', 'xoxb-1234567890-abcdefghij'],
    ['an AWS key id', 'AKIAABCDEFGHIJKLMNOP'],
    ['a Supabase token', `sbp_${'a1'.repeat(15)}`]
  ])('refuses %s in a field, naming its path', (_name, text) => {
    expect(
      checkReview(
        JSON.stringify({
          ...review,
          actions: [{ ...review.actions[0], why: text }]
        }),
        { host: 'mac' }
      )
    ).toEqual({
      ok: false,
      message: 'failed: secret-like text in actions.0.why'
    });
  });

  it('finds a secret in a nested array of evidence', () => {
    expect(
      checkReview(
        JSON.stringify({
          ...review,
          findings: [{ ...finding, evidence: ['fine', '-----BEGIN KEY'] }]
        }),
        { host: 'mac' }
      )
    ).toEqual({
      ok: false,
      message: 'failed: secret-like text in findings.0.evidence.1'
    });
  });

  it('lets ordinary text, paths and ids through', () => {
    const text =
      'PR 812 touched tools/cdwr/agent-queue/supabase/functions/desk-command/handler.ts and the desk-command task, see COD-807 and risk-assessment';
    expect(
      checkReview(
        JSON.stringify({
          ...review,
          actions: [{ ...review.actions[0], why: text }]
        }),
        { host: 'mac' }
      ).ok
    ).toBe(true);
  });

  it('builds the row without id and at', () => {
    const result = checkReview(JSON.stringify(review), {
      host: 'mac',
      cost: 0.5
    });
    expect(result).toEqual({
      ok: true,
      row: { host: 'mac', ...review, cost: 0.5, model: null }
    });
  });

  it('keeps the model and nulls a missing cost', () => {
    const result = checkReview(JSON.stringify(review), {
      host: 'mac',
      model: 'sonnet'
    });
    expect(result).toMatchObject({
      ok: true,
      row: { cost: null, model: 'sonnet' }
    });
  });

  it('fails on text that is not JSON, in one line', () => {
    const result = checkReview('{nope', { host: 'mac' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toMatch(/^failed: not JSON: /);
      expect(result.message).not.toContain('\n');
    }
  });

  it('names the first schema issue', () => {
    const { brief: _brief, ...rest } = review;
    expect(checkReview(JSON.stringify(rest), { host: 'mac' })).toEqual({
      ok: false,
      message: 'failed: brief: Required'
    });
  });
});
