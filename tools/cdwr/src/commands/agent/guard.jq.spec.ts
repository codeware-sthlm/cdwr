import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { requireTools } from '../../testing/require-tools';

const DIR = fileURLToPath(new URL('../../../agent-queue', import.meta.url));

// No skip when jq is missing: this spec covers the merge rule
requireTools('jq');

// Runs `expr` against `input` through the real jq with the guard module included
const run = (expr: string, input: unknown = null): unknown => {
  const res = spawnSync('jq', ['-c', '-L', DIR, `include "guard"; ${expr}`], {
    input: JSON.stringify(input),
    encoding: 'utf8'
  });
  if (res.error) throw res.error;
  if (res.status !== 0) throw new Error(res.stderr);
  return JSON.parse(res.stdout);
};

const PR = 'https://github.com/codeware-sthlm/cdwr/pull';

const APP_ID = 'bbbb4a33-e052-486e-8e0f-d3abb5c5c841';
const PERSON_ID = 'c467d1e2-0000-4000-8000-000000000001';

describe('hold list', () => {
  const HOLD_TEXT = readFileSync(`${DIR}/hold-paths.txt`, 'utf8');
  type Hold = { glob: string; reason: string };
  const holds = run('hold_globs', HOLD_TEXT) as Hold[];
  // Paths of the files in `files` that `globs` hold, through hold_matches
  const matches = (files: string[], globs: Hold[]) =>
    run(
      `hold_matches(${JSON.stringify(files)}; ${JSON.stringify(globs)})`
    ) as Array<{ path: string; glob: string; reason: string }>;
  const held = (path: string, glob: string) =>
    matches([path], [{ glob, reason: '' }]).length === 1;

  describe('hold_globs', () => {
    it('parses the real hold-paths.txt into 27 globs with reasons', () => {
      expect(holds).toHaveLength(27);
      expect(holds[0]).toEqual({
        glob: 'apps/cms/src/migrations/**',
        reason: 'one-way on tenant data'
      });
      expect(holds.at(-1)).toEqual({
        glob: '.claude/hooks/**',
        reason: "kernel: the sessions' hooks"
      });
      expect(holds.every((h) => h.reason !== '')).toBe(true);
    });

    it('skips comments and blank lines, and takes a glob without a reason', () => {
      expect(
        run('hold_globs', '# c\n\n  a/**  # why  \n   # indented\nb.txt\n')
      ).toEqual([
        { glob: 'a/**', reason: 'why' },
        { glob: 'b.txt', reason: '' }
      ]);
    });

    it('fails on a line it cannot read, so no hold is dropped unseen', () => {
      expect(() =>
        run('hold_globs', 'a/**  # fine\nb/** one-way, no hash\n')
      ).toThrow(/unreadable line: b\/\*\* one-way, no hash/);
    });
  });

  describe('hold_matches', () => {
    it.each(holds.map((h) => [h.glob]))('%s holds a path under it', (glob) => {
      const sample = glob.endsWith('/**') ? `${glob.slice(0, -2)}a/b.ts` : glob;
      expect(held(sample, glob)).toBe(true);
    });

    it.each([
      'apps/cms/src/migrations.ts',
      'libs/shared/util/csp-extra/x.ts',
      'tools/cdwr/agent-queue.md',
      'apps/agent-hostx/a.ts'
    ])('%s is held by none of the real globs', (path) => {
      expect(matches([path], holds)).toEqual([]);
    });

    it.each([
      'tools/cdwr/agent-queue/run.sh',
      'tools/cdwr/agent-queue/watch.jq',
      '.claude/skills/work-queue/SKILL.md',
      '.claude/agents/implementer.md'
    ])('%s is not held: only the kernel of the queue is', (path) => {
      expect(matches([path], holds)).toEqual([]);
    });

    it.each([
      'tools/cdwr/agent-queue/guard.jq',
      '.claude/settings.json',
      '.claude/settings.local.json',
      '.github/workflows/ci.yml',
      'tools/cdwr/agent-queue/supabase/migrations/20260101000000_x.sql'
    ])('%s is held', (path) => {
      expect(matches([path], holds)).toHaveLength(1);
    });

    it('carries the glob and reason of the match, in path order', () => {
      expect(
        matches(
          ['libs/shared/util/csp/x.ts', 'apps/cms/src/migrations/y.ts'],
          holds
        )
      ).toEqual([
        {
          path: 'apps/cms/src/migrations/y.ts',
          glob: 'apps/cms/src/migrations/**',
          reason: 'one-way on tenant data'
        },
        {
          path: 'libs/shared/util/csp/x.ts',
          glob: 'libs/shared/util/csp/**',
          reason: 'the cms CSP'
        }
      ]);
    });

    it('`*` does not cross a slash', () => {
      expect(held('a/b.ts', 'a/*.ts')).toBe(true);
      expect(held('a/b/c.ts', 'a/*.ts')).toBe(false);
    });

    it('`?` is one character but a slash', () => {
      expect(held('a/b1.ts', 'a/b?.ts')).toBe(true);
      expect(held('a/b.ts', 'a/b?.ts')).toBe(false);
      expect(held('a/b12.ts', 'a/b?.ts')).toBe(false);
      expect(held('a//.ts', 'a/?.ts')).toBe(false);
    });

    it('regex characters are literal', () => {
      expect(held('a.b', 'a.b')).toBe(true);
      expect(held('axb', 'a.b')).toBe(false);
      expect(held('a+b', 'a+b')).toBe(true);
      expect(held('aab', 'a+b')).toBe(false);
      expect(held('f(1).ts', 'f(1).ts')).toBe(true);
      expect(held('f1.ts', 'f(1).ts')).toBe(false);
      expect(held('a[1]', 'a[1]')).toBe(true);
      expect(held('a1', 'a[1]')).toBe(false);
    });

    it('`**/` is any run of directories, none included', () => {
      expect(held('x.ts', '**/x.ts')).toBe(true);
      expect(held('a/b/x.ts', '**/x.ts')).toBe(true);
      expect(held('a/bx.ts', '**/x.ts')).toBe(false);
    });

    it('a glob without a wildcard matches the whole path only', () => {
      expect(held('tools/x', 'tools/x')).toBe(true);
      expect(held('tools/x/y', 'tools/x')).toBe(false);
      expect(held('a/tools/x', 'tools/x')).toBe(false);
    });
  });

  describe('hold_check_lines', () => {
    const holdLines = HOLD_TEXT.split('\n');
    const header = (a: string, b = a) => [
      `diff --git a/${a} b/${b}`,
      'index 1111111..2222222 100644',
      `--- a/${a}`,
      `+++ b/${b}`,
      '@@ -1 +1 @@',
      '-one',
      '+two'
    ];
    const check = (...diff: string[]) =>
      run('hold_check_lines(.)', [...holdLines, ...diff]);

    it('merges on its own when no file is on the list', () => {
      expect(check(...header('tools/cdwr/README.md'))).toBe(
        'Merge: merging on its own: no hold path'
      );
    });

    it('holds a migration, naming the path, glob and reason', () => {
      expect(check(...header('apps/cms/src/migrations/x.ts'))).toBe(
        'Merge: held: apps/cms/src/migrations/x.ts matches apps/cms/src/migrations/** (one-way on tenant data)'
      );
    });

    it('counts the matches after the first', () => {
      expect(
        check(
          ...header('apps/cms/src/migrations/x.ts'),
          ...header('libs/shared/util/csp/y.ts')
        )
      ).toBe(
        'Merge: held: apps/cms/src/migrations/x.ts matches apps/cms/src/migrations/** (one-way on tenant data), +1 more'
      );
    });

    it('holds a rename whose old side is on the list', () => {
      expect(
        check(...header('apps/cms/src/migrations/old.ts', 'tools/cdwr/new.ts'))
      ).toBe(
        'Merge: held: apps/cms/src/migrations/old.ts matches apps/cms/src/migrations/** (one-way on tenant data)'
      );
    });

    it('holds a rename whose new side is on the list', () => {
      expect(
        check(...header('tools/cdwr/old.ts', 'libs/shared/util/csp/new.ts'))
      ).toBe(
        'Merge: held: libs/shared/util/csp/new.ts matches libs/shared/util/csp/** (the cms CSP)'
      );
    });

    it('holds a diff with no file in it', () => {
      expect(check()).toBe('Merge: held: no changed file in the diff');
    });

    it('does not read a content line as a header', () => {
      expect(
        check(
          ...header('tools/cdwr/README.md'),
          '+diff --git a/apps/cms/src/migrations/x.ts b/apps/cms/src/migrations/x.ts'
        )
      ).toBe('Merge: merging on its own: no hold path');
    });

    it('a hold-list line after the first header is not read as a list', () => {
      // Only what comes before the first header is the list
      expect(
        run('hold_check_lines(.)', [
          'a/**  # why',
          'diff --git a/b.ts b/b.ts',
          'x/**  # other'
        ])
      ).toBe('Merge: merging on its own: no hold path');
    });
  });
});

describe('the kernel and main’s ruleset', () => {
  const HOLD_TEXT = readFileSync(`${DIR}/hold-paths.txt`, 'utf8');
  const ROOT = fileURLToPath(new URL('../../../../..', import.meta.url));
  const holds = run('hold_globs', HOLD_TEXT) as Array<{
    glob: string;
    reason: string;
  }>;
  const kernel = (list: unknown) =>
    run(`kernel_globs(${JSON.stringify(list)})`) as string[];
  const drift = (rules: unknown, list: unknown = holds) =>
    run(`ruleset_drift(${JSON.stringify(rules)}; ${JSON.stringify(list)})`);
  const rule = (...patterns: string[]) => ({
    type: 'pull_request',
    parameters: { required_reviewers: [{ file_patterns: patterns }] }
  });
  const H = [
    { glob: 'b/**', reason: 'kernel: b' },
    { glob: 'a.sh', reason: 'kernel: a' },
    { glob: 'x/**', reason: 'access control' }
  ];

  // What Håkan pastes into the ruleset's required_reviewers
  const PAYLOAD = [
    '.claude/hooks/**',
    '.claude/settings*.json',
    '.github/workflows/**',
    'apps/agent-host/**',
    'packages/*-action/**',
    'tools/cdwr/agent-queue/force-push.sh',
    'tools/cdwr/agent-queue/gh-review.sh',
    'tools/cdwr/agent-queue/github-app.sh',
    'tools/cdwr/agent-queue/guard.jq',
    'tools/cdwr/agent-queue/hold-paths.txt',
    'tools/cdwr/agent-queue/implement.sh',
    'tools/cdwr/agent-queue/lib.sh',
    'tools/cdwr/agent-queue/linear-tools.txt',
    'tools/cdwr/agent-queue/linear-upload.sh',
    'tools/cdwr/agent-queue/session-hook.sh',
    'tools/cdwr/agent-queue/session-start.sh',
    'tools/cdwr/agent-queue/supabase/functions/**',
    'tools/cdwr/agent-queue/supabase/migrations/**',
    'tools/cdwr/agent-queue/telemetry.sh'
  ];

  describe('kernel_globs', () => {
    it('takes the globs whose reason starts with kernel:, sorted and unique', () => {
      expect(kernel([...H, { glob: 'a.sh', reason: 'kernel: again' }])).toEqual(
        ['a.sh', 'b/**']
      );
    });

    it('is empty without a kernel line', () => {
      expect(
        kernel([{ glob: 'x/**', reason: 'the kernel: not first' }])
      ).toEqual([]);
    });
  });

  describe('ruleset_drift', () => {
    it('is null when the rules were not read', () => {
      expect(drift(null, H)).toBeNull();
      expect(drift({ message: 'busy' }, H)).toBeNull();
    });

    it('has both sides empty when the patterns are the kernel', () => {
      expect(drift([rule('a.sh', 'b/**')], H)).toEqual({
        missing: [],
        extra: []
      });
    });

    it('lists the kernel globs no pattern names', () => {
      expect(drift([rule('a.sh')], H)).toEqual({
        missing: ['b/**'],
        extra: []
      });
      expect(drift([], H)).toEqual({ missing: ['a.sh', 'b/**'], extra: [] });
    });

    it('lists the patterns that are no kernel glob', () => {
      expect(drift([rule('a.sh', 'b/**', 'z/**', 'c/**')], H)).toEqual({
        missing: [],
        extra: ['c/**', 'z/**']
      });
    });

    it('ignores a rule that is not pull_request', () => {
      expect(
        drift(
          [
            rule('a.sh', 'b/**'),
            {
              type: 'required_status_checks',
              parameters: { required_reviewers: [{ file_patterns: ['q/**'] }] }
            },
            { type: 'deletion' }
          ],
          H
        )
      ).toEqual({ missing: [], extra: [] });
    });

    it('counts a duplicate pattern once, across rules', () => {
      expect(
        drift([rule('a.sh', 'a.sh', 'z/**'), rule('z/**', 'b/**')], H)
      ).toEqual({ missing: [], extra: ['z/**'] });
    });

    it('does not count a non-kernel hold glob as a kernel glob', () => {
      expect(drift([rule('a.sh', 'b/**', 'x/**')], H)).toEqual({
        missing: [],
        extra: ['x/**']
      });
    });
  });

  describe('the ruleset payload', () => {
    it('is the kernel of the real hold-paths.txt', () => {
      expect(run('hold_globs | kernel_globs(.)', HOLD_TEXT)).toEqual(PAYLOAD);
    });

    it('leaves no drift against a ruleset that names exactly it', () => {
      const rules = [
        {
          type: 'pull_request',
          parameters: { required_reviewers: [{ file_patterns: PAYLOAD }] }
        }
      ];
      expect(drift(rules)).toEqual({ missing: [], extra: [] });
    });

    it('names a file that exists for every glob without a wildcard', () => {
      const plain = PAYLOAD.filter((glob) => !/[*?]/.test(glob));
      expect(plain.length).toBeGreaterThan(0);
      for (const glob of plain) {
        expect(existsSync(join(ROOT, glob)), glob).toBe(true);
      }
    });
  });
});

describe('review_paths', () => {
  const RULES = [
    { type: 'deletion' },
    {
      type: 'pull_request',
      parameters: {
        required_reviewers: [
          {
            minimum_approvals: 1,
            file_patterns: ['tools/cdwr/agent-queue/**', '.claude/**'],
            reviewer: { type: 'Team', id: 1 }
          }
        ]
      }
    }
  ];
  const node = (decision: string | null, paths: string[]) => ({
    reviewDecision: decision,
    files: { nodes: paths.map((path) => ({ path })) }
  });
  const paths = (n: unknown, rules: unknown = RULES) =>
    run(`review_paths(${JSON.stringify(rules)})`, n);

  it('lists the changed files the required reviewers cover, sorted', () => {
    expect(
      paths(
        node('REVIEW_REQUIRED', [
          'tools/cdwr/agent-queue/run.sh',
          'apps/desk/src/x.ts',
          '.claude/skills/work-queue/SKILL.md'
        ])
      )
    ).toEqual([
      '.claude/skills/work-queue/SKILL.md',
      'tools/cdwr/agent-queue/run.sh'
    ]);
  });

  it('does not read the review decision', () => {
    const files = ['tools/cdwr/agent-queue/run.sh'];
    for (const d of ['APPROVED', null, 'REVIEW_REQUIRED']) {
      expect(paths(node(d, files))).toEqual(files);
    }
  });

  it('is null when GitHub gave only the first page of files', () => {
    const n = node('REVIEW_REQUIRED', ['tools/cdwr/agent-queue/run.sh']);
    expect(
      paths({ ...n, files: { ...n.files, pageInfo: { hasNextPage: true } } })
    ).toBeNull();
  });

  it('is null when the rules were not read or name no pattern', () => {
    const n = node('REVIEW_REQUIRED', ['tools/cdwr/agent-queue/run.sh']);
    expect(paths(n, null)).toBeNull();
    expect(
      paths(n, [
        { type: 'pull_request', parameters: { required_reviewers: [] } }
      ])
    ).toBeNull();
  });
});

describe('merge_verdict', () => {
  const NOW_ISO = '2026-10-01T00:00:00Z';
  const holds = run(
    'hold_globs',
    readFileSync(`${DIR}/hold-paths.txt`, 'utf8')
  ) as unknown[];
  const READY_BODY = (...lines: string[]) =>
    [`**Agent: PR ready**: ${PR}/5`, '', ...lines].join('\n');
  const GOOD_LINES = [
    'Code review: no findings',
    'Merge: merging on its own: no hold path'
  ];
  const agentComment = (body: string, createdAt = NOW_ISO) => ({
    body,
    createdAt,
    user: { id: APP_ID, app: true }
  });
  const ticket = (over: Record<string, unknown> = {}) => ({
    identifier: 'COD-9',
    labels: { nodes: [{ name: 'agent:review' }] },
    description: null as string | null,
    comments: { nodes: [agentComment(READY_BODY(...GOOD_LINES))] },
    ...over
  });
  const prNode = (over: Record<string, unknown> = {}) => ({
    id: 'PR_node1',
    state: 'OPEN',
    isDraft: false,
    mergeable: 'MERGEABLE',
    headRefOid: 'h1',
    commits: {
      nodes: [{ commit: { statusCheckRollup: { state: 'SUCCESS' } } }]
    },
    reviewThreads: { pageInfo: { hasNextPage: false }, nodes: [] },
    files: {
      pageInfo: { hasNextPage: false },
      nodes: [{ path: 'tools/cdwr/README.md' }]
    },
    ...over
  });
  const verdict = (
    pr: Record<string, unknown> = prNode(),
    t: Record<string, unknown> = ticket(),
    rules: unknown = []
  ) =>
    run(
      `merge_verdict(${JSON.stringify(t)}; ${JSON.stringify(holds)}; ${JSON.stringify(rules)})`,
      pr
    ) as {
      verdict: string;
      claimed: boolean;
      transient: boolean;
    };
  const withComments = (...bodies: string[]) =>
    ticket({ comments: { nodes: bodies.map((b) => agentComment(b)) } });

  it('is ok for a green open agent:review PR that claims it merges on its own', () => {
    expect(verdict()).toEqual({
      verdict: 'ok PR_node1 h1',
      claimed: true,
      transient: false
    });
  });

  describe("Håkan's review", () => {
    const REVIEW_RULES = [
      {
        type: 'pull_request',
        parameters: {
          required_reviewers: [{ file_patterns: ['apps/desk/**', 'libs/x/**'] }]
        }
      }
    ];
    const reviewNode = (paths: string[], over: Record<string, unknown> = {}) =>
      prNode({
        reviewDecision: null,
        files: {
          pageInfo: { hasNextPage: false },
          nodes: paths.map((path) => ({ path }))
        },
        ...over
      });
    const WATCHED = ['apps/desk/src/a.ts'];
    const approval = (typename: string, state = 'APPROVED', oid = 'h1') => ({
      latestReviews: {
        nodes: [{ state, commit: { oid }, author: { __typename: typename } }]
      }
    });
    const deskVerdict = (
      pr: Record<string, unknown>,
      rules: unknown = REVIEW_RULES
    ) => run(`desk_verdict("merge"; ${JSON.stringify(rules)})`, pr);

    it('holds for a lasting reason on a watched file with no approval, whatever reviewDecision says', () => {
      const expected = "needs Håkan's approval on GitHub (apps/desk/src/a.ts)";
      expect(deskVerdict(reviewNode(WATCHED))).toBe(expected);
      expect(
        deskVerdict(reviewNode(WATCHED, { reviewDecision: 'REVIEW_REQUIRED' }))
      ).toBe(expected);
      expect(verdict(reviewNode(WATCHED), ticket(), REVIEW_RULES)).toEqual({
        verdict: expected,
        claimed: true,
        transient: false
      });
    });

    it('counts the other matches after the first', () => {
      const n = reviewNode(['apps/desk/src/a.ts', 'libs/x/b.ts']);
      expect(deskVerdict(n)).toBe(
        "needs Håkan's approval on GitHub (apps/desk/src/a.ts, +1 more)"
      );
    });

    it('is ok after a person approved', () => {
      const n = reviewNode(WATCHED, approval('User'));
      expect(deskVerdict(n)).toBe('ok PR_node1 h1');
      expect(verdict(n, ticket(), REVIEW_RULES)).toEqual({
        verdict: 'ok PR_node1 h1',
        claimed: true,
        transient: false
      });
    });

    it('is not approved by the app, or by a review that is not an approval', () => {
      const expected = "needs Håkan's approval on GitHub (apps/desk/src/a.ts)";
      expect(deskVerdict(reviewNode(WATCHED, approval('Bot')))).toBe(expected);
      expect(
        deskVerdict(reviewNode(WATCHED, approval('User', 'COMMENTED')))
      ).toBe(expected);
    });

    it('is ok when no changed file matches a pattern', () => {
      expect(deskVerdict(reviewNode(['apps/web/src/x.ts']))).toBe(
        'ok PR_node1 h1'
      );
      expect(deskVerdict(reviewNode(WATCHED), [])).toBe('ok PR_node1 h1');
    });

    it("holds, transient, when main's branch rules were not read", () => {
      expect(deskVerdict(reviewNode(WATCHED), null)).toBe(
        "main's branch rules were not read"
      );
      expect(verdict(reviewNode(WATCHED), ticket(), null)).toEqual({
        verdict: "main's branch rules were not read",
        claimed: true,
        transient: true
      });
    });

    it('holds when GitHub gave only the first page of files', () => {
      const n = reviewNode(WATCHED, {
        files: {
          pageInfo: { hasNextPage: true },
          nodes: WATCHED.map((path) => ({ path }))
        }
      });
      expect(deskVerdict(n)).toBe(
        "too many changed files to check for Håkan's review"
      );
    });

    it('holds when the files were not read', () => {
      expect(deskVerdict(prNode({ files: null }))).toBe(
        "the PR's files were not read"
      );
    });

    it('lets a parked wait speak first, so a session mid-round sends no notice', () => {
      expect(
        verdict(
          reviewNode(WATCHED),
          ticket({
            description:
              '## Plan\n\n**Next:** `Waiting: CI · PR 5 @ abc1234 · since 2026-10-01T00:00Z`'
          }),
          REVIEW_RULES
        )
      ).toEqual({
        verdict: 'the ticket is parked on a wait',
        claimed: true,
        transient: true
      });
    });

    it('does not count an approval of an older head', () => {
      expect(
        deskVerdict(reviewNode(WATCHED, approval('User', 'APPROVED', 'h0')))
      ).toBe("needs Håkan's approval on GitHub (apps/desk/src/a.ts)");
    });

    it('lets a long file list through once approved, or when no rule names a pattern', () => {
      const long = {
        files: {
          pageInfo: { hasNextPage: true },
          nodes: WATCHED.map((path) => ({ path }))
        }
      };
      expect(
        deskVerdict(reviewNode(WATCHED, { ...long, ...approval('User') }))
      ).toBe('ok PR_node1 h1');
      expect(deskVerdict(reviewNode(WATCHED, long), [])).toBe('ok PR_node1 h1');
    });

    it("holds on a person's change request though reviewDecision reads null", () => {
      expect(
        verdict(
          reviewNode(
            ['apps/web/src/x.ts'],
            approval('User', 'CHANGES_REQUESTED')
          ),
          ticket(),
          REVIEW_RULES
        ).verdict
      ).toBe('a review requested changes');
    });
  });

  it('reads a bold Merge label and a list item as the claim', () => {
    expect(
      verdict(
        prNode(),
        withComments(
          READY_BODY(
            '- **Code review:** no findings',
            '**Merge:** merging on its own: no hold path'
          )
        )
      )
    ).toMatchObject({ verdict: 'ok PR_node1 h1', claimed: true });
  });

  it('holds while the ticket is parked on a wait, without a notice', () => {
    expect(
      verdict(
        prNode(),
        ticket({
          description:
            '## Plan\n\n**Next:** `Waiting: CI · PR 5 @ abc1234 · since 2026-10-01T00:00Z`'
        })
      )
    ).toEqual({
      verdict: 'the ticket is parked on a wait',
      claimed: true,
      transient: true
    });
  });

  it('holds without a notice when the ticket lost its agent label', () => {
    expect(verdict(prNode(), ticket({ labels: { nodes: [] } }))).toEqual({
      verdict: 'the ticket is not agent:review',
      claimed: true,
      transient: true
    });
  });

  it('holds on a hold path, naming the path and glob', () => {
    expect(
      verdict(
        prNode({
          files: {
            pageInfo: { hasNextPage: false },
            nodes: [
              { path: 'tools/cdwr/README.md' },
              { path: 'apps/cms/src/migrations/x.ts' }
            ]
          }
        })
      )
    ).toEqual({
      verdict:
        'apps/cms/src/migrations/x.ts matches apps/cms/src/migrations/** (one-way on tenant data)',
      claimed: true,
      transient: false
    });
  });

  it('holds on the Ask me before merging marker above the plan', () => {
    expect(
      verdict(
        prNode(),
        ticket({
          description: 'Report\n\n**Ask me before merging**\n\n## Plan\nx'
        })
      ).verdict
    ).toBe('the report says Ask me before merging');
  });

  it('holds when the Apply list writes a secret', () => {
    expect(
      verdict(
        prNode(),
        withComments(
          READY_BODY(
            ...GOOD_LINES,
            '',
            'Apply list:',
            '',
            '- [ ] agent-deploy',
            '- [ ] secret-set production /apps/cms DATABASE_POOL_MAX 8'
          )
        )
      )
    ).toEqual({
      verdict: 'the Apply list writes a secret',
      claimed: true,
      transient: false
    });
  });

  it('merges past a dropped secret item and other apply kinds', () => {
    expect(
      verdict(
        prNode(),
        withComments(
          READY_BODY(
            ...GOOD_LINES,
            '',
            'Apply list:',
            '',
            '- [ ] agent-deploy',
            '- [ ] ~~secret-copy production /apps/cms A B~~'
          )
        )
      ).verdict
    ).toBe('ok PR_node1 h1');
  });

  it('ignores the marker below the plan heading', () => {
    expect(
      verdict(
        prNode(),
        ticket({
          description: 'Report\n\n## Plan\n**Ask me before merging**\n'
        })
      ).verdict
    ).toBe('ok PR_node1 h1');
  });

  it('holds with an unresolved review thread', () => {
    expect(
      verdict(
        prNode({
          reviewThreads: {
            pageInfo: { hasNextPage: false },
            nodes: [
              {
                isResolved: false,
                comments: {
                  nodes: [
                    { body: 'fix', author: { login: 'h', __typename: 'User' } }
                  ]
                }
              }
            ]
          }
        })
      )
    ).toEqual({
      verdict: '1 unresolved thread',
      claimed: true,
      // Review feedback is a session's pick, so no held notice
      transient: true
    });
  });

  it('holds without a Code review line', () => {
    expect(
      verdict(
        prNode(),
        withComments(READY_BODY('Merge: merging on its own: no hold path'))
      ).verdict
    ).toBe('the PR-ready comment has no Code review line');
  });

  it('holds when the comment lacks the Merge line, and is not claimed', () => {
    expect(
      verdict(prNode(), withComments(READY_BODY('Code review: no findings')))
    ).toEqual({
      verdict: 'the PR-ready comment does not say it merges on its own',
      claimed: false,
      transient: false
    });
  });

  it('holds when the Merge line says held', () => {
    expect(
      verdict(
        prNode(),
        withComments(
          READY_BODY('Code review: no findings', 'Merge: held: x matches y')
        )
      ).claimed
    ).toBe(false);
  });

  it('holds without a PR-ready comment', () => {
    expect(verdict(prNode(), ticket({ comments: { nodes: [] } })).verdict).toBe(
      'no PR-ready comment'
    );
  });

  it('holds when a person commented after the PR-ready comment', () => {
    const t = ticket({
      comments: {
        nodes: [
          agentComment(READY_BODY(...GOOD_LINES)),
          {
            body: 'wait',
            createdAt: '2026-10-02T00:00:00Z',
            user: { id: PERSON_ID, app: false }
          }
        ]
      }
    });
    expect(verdict(prNode(), t).verdict).toBe(
      'Håkan commented after the PR-ready comment'
    );
  });

  it('merges when only the agent commented after the PR-ready comment', () => {
    const t = ticket({
      comments: {
        nodes: [
          agentComment(READY_BODY(...GOOD_LINES)),
          agentComment('**Agent: note** later', '2026-10-02T00:00:00Z')
        ]
      }
    });
    expect(verdict(prNode(), t).verdict).toBe('ok PR_node1 h1');
  });

  it('holds when the changed files run past the first page', () => {
    expect(
      verdict(
        prNode({
          files: {
            pageInfo: { hasNextPage: true },
            nodes: [{ path: 'tools/cdwr/README.md' }]
          }
        })
      ).verdict
    ).toBe('too many changed files to check them all');
  });

  it('holds when the files were not read', () => {
    const { files: _files, ...rest } = prNode();
    expect(verdict(rest).verdict).toBe("the PR's files were not read");
  });

  it('holds with no changed files', () => {
    expect(
      verdict(
        prNode({ files: { pageInfo: { hasNextPage: false }, nodes: [] } })
      ).verdict
    ).toBe('no changed files read');
  });

  it.each(['agent:working', 'agent:ready'])(
    'holds when the ticket label is %s',
    (label) => {
      expect(
        verdict(prNode(), ticket({ labels: { nodes: [{ name: label }] } }))
          .verdict
      ).toBe('the ticket is not agent:review');
    }
  );

  it('holds on a PR that is not open', () => {
    expect(verdict(prNode({ state: 'MERGED' })).verdict).toBe('PR is merged');
  });

  describe('transient', () => {
    it('is true for pending checks', () => {
      expect(
        verdict(
          prNode({
            commits: {
              nodes: [{ commit: { statusCheckRollup: { state: 'PENDING' } } }]
            }
          })
        )
      ).toEqual({ verdict: 'checks pending', claimed: true, transient: true });
    });

    it('is true for a conflict', () => {
      expect(verdict(prNode({ mergeable: 'CONFLICTING' }))).toEqual({
        verdict: 'conflicts with main',
        claimed: true,
        transient: true
      });
    });

    it('is false for a hold path', () => {
      expect(
        verdict(
          prNode({
            files: {
              pageInfo: { hasNextPage: false },
              nodes: [{ path: 'apps/cms/src/migrations/x.ts' }]
            }
          })
        ).transient
      ).toBe(false);
    });
  });
});

// The scheduler's verdict on a desk command, from the PR it just read; desk_pr_check prints it
describe('guard.jq desk_verdict', () => {
  const verdict = (
    kind: string,
    pr: Record<string, unknown>,
    rules: unknown = []
  ) =>
    execFileSync(
      'jq',
      [
        '-L',
        DIR,
        '-r',
        '--arg',
        'kind',
        kind,
        '--argjson',
        'rules',
        JSON.stringify(rules),
        'include "guard"; desk_verdict($kind; $rules)'
      ],
      { input: JSON.stringify(pr), encoding: 'utf8' }
    ).trim();
  const ready = (over: Record<string, unknown> = {}) => ({
    id: 'PR_node',
    headRefOid: 'abc123',
    state: 'OPEN',
    isDraft: false,
    mergeable: 'MERGEABLE',
    mergeQueueEntry: null,
    files: { nodes: [] },
    commits: {
      nodes: [{ commit: { statusCheckRollup: { state: 'SUCCESS' } } }]
    },
    reviewThreads: { nodes: [] },
    reviewRequests: { nodes: [] },
    reviews: { nodes: [] },
    ...over
  });

  it('lets a ready PR through with its node and head', () => {
    expect(verdict('merge', ready())).toBe('ok PR_node abc123');
    expect(verdict('copilot', ready())).toBe('ok PR_node abc123');
  });

  it.each([
    [{ state: 'MERGED' }, 'PR is merged'],
    [{ isDraft: true }, 'PR is a draft'],
    [{ mergeQueueEntry: { state: 'QUEUED' } }, 'already in the merge queue'],
    [{ mergeable: 'CONFLICTING' }, 'conflicts with main'],
    [{ mergeable: 'UNKNOWN' }, 'GitHub has not checked for conflicts yet'],
    [
      {
        commits: {
          nodes: [{ commit: { statusCheckRollup: { state: 'PENDING' } } }]
        }
      },
      'checks pending'
    ],
    [{ commits: { nodes: [] } }, 'checks missing'],
    [
      { reviewThreads: { pageInfo: { hasNextPage: true }, nodes: [] } },
      'too many review threads to check them all'
    ],
    [
      {
        reviewThreads: {
          nodes: [
            {
              isResolved: false,
              comments: {
                nodes: [{ author: { __typename: 'Bot' }, body: 'x' }]
              }
            }
          ]
        }
      },
      '1 unresolved thread'
    ]
  ])('refuses a merge: %j', (over, why) => {
    expect(verdict('merge', ready(over))).toBe(why);
  });

  it('refuses a merge of a watched file until a person approves, and one with no rules read', () => {
    const rules = [
      {
        type: 'pull_request',
        parameters: { required_reviewers: [{ file_patterns: ['a/**'] }] }
      }
    ];
    const files = { nodes: [{ path: 'a/x.sh' }] };
    expect(verdict('merge', ready({ files }), rules)).toBe(
      "needs Håkan's approval on GitHub (a/x.sh)"
    );
    expect(
      verdict(
        'merge',
        ready({
          files,
          latestReviews: {
            nodes: [
              {
                state: 'APPROVED',
                commit: { oid: 'abc123' },
                author: { __typename: 'User' }
              }
            ]
          }
        }),
        rules
      )
    ).toBe('ok PR_node abc123');
    expect(verdict('merge', ready({ files }), null)).toBe(
      "main's branch rules were not read"
    );
    // A Copilot request has no use for the rules
    expect(verdict('copilot', ready({ files }), null)).toBe(
      'ok PR_node abc123'
    );
  });

  it('refuses a Copilot request once one is asked or done', () => {
    expect(
      verdict(
        'copilot',
        ready({
          reviewRequests: {
            nodes: [
              {
                requestedReviewer: { login: 'copilot-pull-request-reviewer' }
              }
            ]
          }
        })
      )
    ).toBe('Copilot review already requested');
    expect(
      verdict(
        'copilot',
        ready({
          reviews: {
            nodes: [{ author: { login: 'copilot-pull-request-reviewer' } }]
          }
        })
      )
    ).toBe('Copilot has reviewed it');
  });
});

// The container's jq is 1.6, which refuses a keyword as a .field or a $variable; CI's jq does not
describe('guard.jq on jq 1.6', () => {
  const KEYWORDS =
    'and|or|not|if|then|elif|else|end|as|def|reduce|foreach|try|catch|label|import|include|__loc__';
  it('uses no jq keyword as a field or variable name', () => {
    // Strings and comments in one pass, so a # in a string or a quote in a comment counts for neither
    const code = readFileSync(`${DIR}/guard.jq`, 'utf8').replace(
      /"(?:[^"\\]|\\.)*"|#.*$/gm,
      (match) => (match.startsWith('"') ? '""' : '')
    );
    expect(code.match(new RegExp(`[.$](?:${KEYWORDS})\\b`, 'g')) ?? []).toEqual(
      []
    );
  });
});
