import {
  APP_PATH,
  type DeskRun,
  QUIT_WAIT_MS,
  artifactVerdict,
  chooseRun,
  installSteps,
  installedSummary,
  isMissingXattr,
  parsePrHead,
  parseRuns,
  platformProblem,
  quitGaveUp,
  rebuildFix,
  staleNote
} from './desk-install.logic';

const run = (over: Partial<DeskRun>): DeskRun => ({
  databaseId: 1,
  headSha: 'aaaaaaa1111',
  headBranch: 'main',
  event: 'push',
  conclusion: 'success',
  createdAt: '2026-10-01T10:00:00Z',
  ...over
});

describe('platformProblem', () => {
  it.each([
    ['darwin', 'arm64', undefined],
    ['darwin', 'x64', 'macOS arm64 only'],
    ['linux', 'arm64', 'macOS arm64 only'],
    ['win32', 'x64', 'macOS arm64 only']
  ])('%s %s', (platform, arch, expected) => {
    const problem = platformProblem(platform, arch);
    if (expected === undefined) expect(problem).toBeUndefined();
    else expect(problem).toContain(expected);
  });
});

describe('parseRuns', () => {
  it.each([
    ['not json', []],
    ['{}', []],
    ['[{"databaseId":1}]', []],
    ['[]', []]
  ])('%s -> nothing', (text, expected) => {
    expect(parseRuns(text)).toEqual(expected);
  });

  it('reads a run', () => {
    expect(parseRuns(JSON.stringify([run({})]))).toEqual([run({})]);
  });
});

describe('chooseRun', () => {
  const pr = { branch: 'cod-1-desk', sha: 'bbbbbbb2222', fork: false };

  it.each([
    [
      'newest successful push to main',
      [
        run({ databaseId: 1, createdAt: '2026-10-01T10:00:00Z' }),
        run({ databaseId: 2, createdAt: '2026-10-02T10:00:00Z' }),
        run({
          databaseId: 3,
          createdAt: '2026-10-03T10:00:00Z',
          conclusion: 'failure'
        })
      ],
      undefined,
      2
    ],
    [
      'main takes a push or a manual run, not a PR run',
      [
        run({ databaseId: 1, createdAt: '2026-10-01T10:00:00Z' }),
        run({ databaseId: 2, headBranch: 'cod-1-desk', event: 'pull_request' }),
        run({
          databaseId: 3,
          event: 'workflow_dispatch',
          createdAt: '2026-10-03T10:00:00Z'
        }),
        run({
          databaseId: 4,
          event: 'pull_request',
          createdAt: '2026-10-04T10:00:00Z'
        })
      ],
      undefined,
      3
    ],
    [
      'the PR prefers a run of its head commit',
      [
        run({
          databaseId: 1,
          headBranch: 'cod-1-desk',
          headSha: 'bbbbbbb2222',
          event: 'pull_request',
          createdAt: '2026-10-02T10:00:00Z'
        }),
        run({
          databaseId: 2,
          headBranch: 'cod-1-desk',
          headSha: 'ccccccc3333',
          event: 'pull_request',
          createdAt: '2026-10-03T10:00:00Z'
        })
      ],
      pr,
      1
    ],
    [
      'the PR falls back to its branch, pull request or manual runs',
      [
        run({ databaseId: 1 }),
        run({
          databaseId: 2,
          headBranch: 'cod-1-desk',
          event: 'pull_request',
          createdAt: '2026-10-02T10:00:00Z'
        }),
        run({
          databaseId: 3,
          headBranch: 'cod-1-desk',
          event: 'workflow_dispatch',
          createdAt: '2026-10-03T10:00:00Z'
        }),
        run({
          databaseId: 4,
          headBranch: 'cod-1-desk',
          event: 'push',
          createdAt: '2026-10-04T10:00:00Z'
        })
      ],
      pr,
      3
    ],
    [
      'a fork PR from a branch named main never takes main push builds',
      [run({ databaseId: 1 }), run({ databaseId: 2, event: 'pull_request' })],
      { branch: 'main', sha: 'bbbbbbb2222', fork: true },
      2
    ]
  ])('%s', (_name, runs, prHead, expected) => {
    expect(chooseRun(runs, prHead)?.databaseId).toBe(expected);
  });

  it.each([
    ['no runs', [], undefined],
    ['only failures', [run({ conclusion: 'failure' })], undefined],
    ['no run on the PR branch', [run({})], pr],
    [
      'only a push on the PR branch',
      [run({ headBranch: 'cod-1-desk', event: 'push' })],
      pr
    ],
    [
      'a fork PR named main and only a manual run of upstream main',
      [run({ event: 'workflow_dispatch' })],
      { branch: 'main', sha: 'bbbbbbb2222', fork: true }
    ]
  ])('%s -> undefined', (_name, runs, prHead) => {
    expect(chooseRun(runs, prHead)).toBeUndefined();
  });
});

describe('parsePrHead', () => {
  it('reads the branch and head', () => {
    expect(
      parsePrHead(
        '{"headRefName":"cod-1-desk","headRefOid":"bbbbbbb2222","isCrossRepository":true}'
      )
    ).toEqual({ branch: 'cod-1-desk', sha: 'bbbbbbb2222', fork: true });
  });

  it.each(['nope', '{}', '{"headRefName":"","headRefOid":"x"}'])(
    '%s -> undefined',
    (text) => {
      expect(parsePrHead(text)).toBeUndefined();
    }
  );
});

describe('staleNote', () => {
  const pr = { branch: 'b', sha: '5d6e7f8abcdef', fork: false };

  it.each([
    [
      run({ headSha: '1a2b3c4abcdef' }),
      pr,
      'Built from 1a2b3c4, the PR is at 5d6e7f8'
    ],
    [run({ headSha: '5d6e7f8abcdef' }), pr, undefined],
    [run({ headSha: '1a2b3c4abcdef' }), undefined, undefined]
  ])('%#', (built, prHead, expected) => {
    expect(staleNote(built, prHead)).toBe(expected);
  });
});

describe('artifactVerdict', () => {
  const list = (artifacts: unknown[]): string =>
    JSON.stringify({ total_count: artifacts.length, artifacts });

  it.each([
    [list([{ name: 'agent-desk-macos-arm64', expired: false }]), 'present'],
    [list([{ name: 'agent-desk-macos-arm64', expired: true }]), 'expired'],
    [list([{ name: 'other', expired: false }]), 'missing'],
    [list([]), 'missing'],
    ['{}', 'missing'],
    ['not json', 'missing']
  ])('%s -> %s', (text, expected) => {
    expect(artifactVerdict(text)).toBe(expected);
  });
});

describe('rebuildFix', () => {
  it.each([
    [undefined, 'gh workflow run desk.yml`'],
    ['cod-1-desk', 'gh workflow run desk.yml --ref cod-1-desk`']
  ])('%s', (branch, expected) => {
    const text = rebuildFix(branch);
    expect(text).toContain(expected);
    expect(text).toContain('nx tauri-build desk');
  });
});

describe('installSteps', () => {
  it.each([
    [true, `Replace ${APP_PATH}`],
    [false, `Install ${APP_PATH}`]
  ])('replacing %s', (replacing, expected) => {
    const labels = installSteps(run({ databaseId: 9 }), replacing).map(
      (step) => step.label
    );
    expect(labels).toEqual([
      'Download the build of aaaaaaa',
      'Unpack Agent Desk.app.zip',
      'Quit Agent Desk if it is running',
      expected,
      'Clear the quarantine flag'
    ]);
  });
});

describe('installedSummary', () => {
  it('says where and how to open it', () => {
    expect(installedSummary()).toBe(
      'Installed /Applications/Agent Desk.app. Open it with: open "/Applications/Agent Desk.app"'
    );
  });
});

describe('quitGaveUp', () => {
  it.each([
    [0, false],
    [QUIT_WAIT_MS - 1, false],
    [QUIT_WAIT_MS, true]
  ])('%d ms -> %s', (elapsed, expected) => {
    expect(quitGaveUp(elapsed)).toBe(expected);
  });
});

describe('isMissingXattr', () => {
  it.each([
    ['xattr: No such xattr: com.apple.quarantine', true],
    ['Permission denied', false]
  ])('%s -> %s', (stderr, expected) => {
    expect(isMissingXattr(stderr)).toBe(expected);
  });
});
