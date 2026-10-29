import {
  KEYCHAIN_SERVICE,
  LABEL,
  QUEUE_FILES,
  QUEUE_SOURCE_DIR,
  type QueueView,
  STALE_LOCK_MS,
  domainTarget,
  drift,
  filesDrift,
  formatHeld,
  formatImplement,
  formatNext,
  formatParked,
  formatTable,
  formatWatching,
  hostKind,
  implementBudget,
  implementCap,
  installedEnv,
  lastImplementRun,
  lastSchedulerLine,
  latestRunLog,
  launchPath,
  linearKeySource,
  lockState,
  memoryDir,
  nodeMajor,
  parseAttended,
  parseCheck,
  parseLaunchctlPrint,
  parseLinear,
  parseNotifyLevel,
  parseQueueView,
  parseSuggest,
  parseWatchState,
  plistPath,
  queuePaths,
  remoteListLogs,
  remoteLogFile,
  remoteReadLog,
  renderPlist,
  serviceTarget,
  spendForDay,
  suggestSettings,
  summarizeSchedulerLine,
  tailLines
} from './agent.logic';

// Real `launchctl print gui/501/se.codeware.agent-queue` output
const LAUNCHCTL_PRINT = `gui/501/se.codeware.agent-queue = {
	active count = 0
	path = /Users/hakans/Library/LaunchAgents/se.codeware.agent-queue.plist
	type = LaunchAgent
	state = not running

	program = /bin/zsh
	arguments = {
		/bin/zsh
		/Users/hakans/.claude/agent-queue/run.sh
	}

	stdout path = /Users/hakans/.claude/agent-queue/logs/launchd.log
	stderr path = /Users/hakans/.claude/agent-queue/logs/launchd.log
	inherited environment = {
		SSH_AUTH_SOCK => /var/run/com.apple.launchd.2888LC4ojo/Listeners
	}

	default environment = {
		PATH => /usr/bin:/bin:/usr/sbin:/sbin
	}

	environment = {
		OSLogRateLimit => 64
		XPC_SERVICE_NAME => se.codeware.agent-queue
	}

	domain = gui/501 [100002]
	asid = 100002
	minimum runtime = 10
	exit timeout = 5
	runs = 2
	last exit code = 0

	resource coalition = {
		ID = 292895
		type = resource
		state = active
		active count = 1
		name = se.codeware.agent-queue
	}

	jetsam coalition = {
		ID = 292896
		type = jetsam
		state = active
		active count = 1
		name = se.codeware.agent-queue
	}

	spawn type = daemon (3)
	jetsam priority = 40
	jetsam memory limit (active) = (unlimited)
	jetsam memory limit (inactive) = (unlimited)
	jetsamproperties category = daemon
	jetsam thread limit = 32
	cpumon = default
	run interval = 3600 seconds

	properties = inferred program
}
`;

describe('constants', () => {
  it('names the job, the keychain item and the queue files', () => {
    expect(LABEL).toBe('se.codeware.agent-queue');
    expect(KEYCHAIN_SERVICE).toBe('linear-agent-queue');
    expect(QUEUE_SOURCE_DIR).toBe('tools/cdwr/agent-queue');
    expect(QUEUE_FILES).toEqual([
      'run.sh',
      'implement.sh',
      'github-app.sh',
      'checkin.sh',
      'lib.sh',
      'waits.sh',
      'watch.jq',
      'notify.sh',
      'telemetry.sh'
    ]);
  });
});

describe('linearKeySource', () => {
  it.each([
    ['container', { AGENT_QUEUE_LINEAR_KEY: 'k' }, 'env'],
    ['container', { AGENT_QUEUE_LINEAR_KEY: '' }, 'none'],
    ['container', {}, 'none'],
    ['launchd', {}, 'keychain-possible'],
    ['launchd', { AGENT_QUEUE_LINEAR_KEY: 'k' }, 'keychain-possible'],
    [null, { AGENT_QUEUE_LINEAR_KEY: 'k' }, 'none']
  ] as const)('%s with %j -> %s', (host, env, expected) => {
    expect(linearKeySource(host, env)).toBe(expected);
  });
});

describe('hostKind', () => {
  it.each([
    ['darwin', {}, 'launchd'],
    ['darwin', { AGENT_QUEUE_HOST: 'container' }, 'container'],
    ['linux', { AGENT_QUEUE_HOST: 'container' }, 'container'],
    ['linux', {}, null],
    ['darwin', { AGENT_QUEUE_HOST: 'other' }, 'launchd']
  ] as const)('%s with %j -> %s', (platform, env, expected) => {
    expect(hostKind(platform, env)).toBe(expected);
  });
});

describe('queuePaths', () => {
  it('puts everything under the cdwr home, the plist under the user home', () => {
    expect(queuePaths('/h/.cdwr', '/h')).toEqual({
      home: '/h/.cdwr/agent-queue',
      script: '/h/.cdwr/agent-queue/run.sh',
      files: {
        'run.sh': '/h/.cdwr/agent-queue/run.sh',
        'implement.sh': '/h/.cdwr/agent-queue/implement.sh',
        'github-app.sh': '/h/.cdwr/agent-queue/github-app.sh',
        'checkin.sh': '/h/.cdwr/agent-queue/checkin.sh',
        'lib.sh': '/h/.cdwr/agent-queue/lib.sh',
        'waits.sh': '/h/.cdwr/agent-queue/waits.sh',
        'watch.jq': '/h/.cdwr/agent-queue/watch.jq',
        'notify.sh': '/h/.cdwr/agent-queue/notify.sh',
        'telemetry.sh': '/h/.cdwr/agent-queue/telemetry.sh'
      },
      watchState: '/h/.cdwr/agent-queue/watch.json',
      paused: '/h/.cdwr/agent-queue/paused',
      notifyLevel: '/h/.cdwr/agent-queue/notify-level',
      mirror: '/h/.cdwr/agent-queue/mirror',
      lock: '/h/.cdwr/agent-queue/lock',
      implementLock: '/h/.cdwr/agent-queue/implement.lock',
      implementSpend: '/h/.cdwr/agent-queue/implement-spend.jsonl',
      runs: '/h/.cdwr/agent-queue/runs.jsonl',
      logs: '/h/.cdwr/agent-queue/logs',
      schedulerLog: '/h/.cdwr/agent-queue/logs/scheduler.log',
      launchdLog: '/h/.cdwr/agent-queue/logs/launchd.log',
      plist: '/h/Library/LaunchAgents/se.codeware.agent-queue.plist'
    });
  });
});

describe('parseNotifyLevel', () => {
  it.each([
    [undefined, 'all'],
    ['', 'all'],
    ['action\n', 'action'],
    ['all', 'all'],
    ['junk', 'all']
  ] as const)('reads %j as %s', (text, level) => {
    expect(parseNotifyLevel(text)).toBe(level);
  });
});

describe('lockState', () => {
  it.each([
    [undefined, false, 'free'],
    [undefined, true, 'free'],
    [5_000, false, 'held'],
    [STALE_LOCK_MS + 1, true, 'held'],
    [STALE_LOCK_MS + 1, false, 'stale']
  ] as const)('age %s, running %s is %s', (age, running, expected) => {
    expect(lockState(age, running)).toBe(expected);
  });
});

describe('targets', () => {
  it('builds the launchctl targets from the uid', () => {
    expect(serviceTarget(501)).toBe('gui/501/se.codeware.agent-queue');
    expect(domainTarget(501)).toBe('gui/501');
  });
});

describe('renderPlist', () => {
  const input = {
    script: '/h/.cdwr/agent-queue/run.sh',
    home: '/h/.cdwr/agent-queue',
    repo: '/w/codeware-agent',
    path: '/opt/homebrew/bin:/usr/bin',
    memoryDir: '/h/.claude/projects/-w-dev/memory',
    suggest: { budgetUsd: 5, hour: 6, days: 1 }
  };

  it('describes the job', () => {
    const plist = renderPlist(input);
    expect(plist).toContain('<string>se.codeware.agent-queue</string>');
    expect(plist).toContain('<string>/bin/zsh</string>');
    expect(plist).toContain('<string>/h/.cdwr/agent-queue/run.sh</string>');
    expect(plist).toContain('<integer>600</integer>');
    // The backgrounded implement session outlives run.sh
    expect(plist).toContain('<key>AbandonProcessGroup</key>\n  <true/>');
    expect(plist).toContain(
      '<key>AGENT_QUEUE_IMPLEMENT_CAP_USD</key>\n    <string>40</string>'
    );
    expect(plist).toContain(
      '<key>AGENT_QUEUE_SUGGEST_BUDGET_USD</key>\n    <string>5</string>'
    );
    expect(plist).toContain(
      '<key>AGENT_QUEUE_SUGGEST_HOUR</key>\n    <string>6</string>'
    );
    expect(plist).toContain(
      '<key>AGENT_QUEUE_SUGGEST_DAYS</key>\n    <string>1</string>'
    );
    expect(plist).toContain(
      '<key>AGENT_QUEUE_MEMORY_DIR</key>\n    <string>/h/.claude/projects/-w-dev/memory</string>'
    );
    expect(plist).toContain('<key>RunAtLoad</key>\n  <false/>');
    expect(plist).toContain(
      '<key>AGENT_QUEUE_HOME</key>\n    <string>/h/.cdwr/agent-queue</string>'
    );
    expect(plist).toContain(
      '<key>AGENT_QUEUE_REPO</key>\n    <string>/w/codeware-agent</string>'
    );
    expect(plist).toContain(
      '<key>PATH</key>\n    <string>/opt/homebrew/bin:/usr/bin</string>'
    );
    expect(
      plist.match(
        /<string>\/h\/\.cdwr\/agent-queue\/logs\/launchd\.log<\/string>/g
      )
    ).toHaveLength(2);
  });

  it('is deterministic', () => {
    expect(renderPlist(input)).toBe(renderPlist({ ...input }));
  });

  it('escapes XML in every value', () => {
    const plist = renderPlist({
      script: '/a&b/run.sh',
      home: '/<h>',
      repo: '/"r"',
      path: "/it's",
      memoryDir: '/m',
      suggest: { budgetUsd: 5, hour: 6, days: 1 }
    });
    expect(plist).toContain('/a&amp;b/run.sh');
    expect(plist).toContain('/&lt;h&gt;');
    expect(plist).toContain('/&quot;r&quot;');
    expect(plist).toContain('/it&apos;s');
    expect(plist).not.toContain('/a&b');
  });
});

describe('parseLaunchctlPrint', () => {
  it('reads the top-level keys and ignores nested state', () => {
    expect(parseLaunchctlPrint(LAUNCHCTL_PRINT)).toEqual({
      running: false,
      runs: 2,
      lastExitCode: 0,
      script: '/Users/hakans/.claude/agent-queue/run.sh',
      intervalSeconds: 3600
    });
  });

  it('is running when the top-level state says so', () => {
    const text = LAUNCHCTL_PRINT.replace(
      '\tstate = not running',
      '\tstate = running'
    );
    expect(parseLaunchctlPrint(text).running).toBe(true);
  });

  it('leaves a non-numeric last exit code undefined', () => {
    const text = LAUNCHCTL_PRINT.replace(
      'last exit code = 0',
      'last exit code = (never exited)'
    );
    expect(parseLaunchctlPrint(text).lastExitCode).toBeUndefined();
  });

  it('is not running with nothing to read', () => {
    expect(parseLaunchctlPrint('')).toEqual({ running: false });
  });
});

describe('latestRunLog', () => {
  it.each([
    [
      ['2026-10-03_0800.log', '2026-10-04_0900.log', '2026-10-04_0800.log'],
      '2026-10-04_0900.log'
    ],
    [
      ['scheduler.log', 'launchd.log', '2026-10-04_0800.log'],
      '2026-10-04_0800.log'
    ],
    [['scheduler.log', 'launchd.log', 'x2026-10-04_0800.log'], undefined],
    [[], undefined]
  ])('%j -> %s', (names, expected) => {
    expect(latestRunLog(names)).toBe(expected);
  });
});

describe('lastSchedulerLine', () => {
  it.each([
    [
      '2026-10-04 08:00:01 skip: x\n2026-10-04 09:00:02 plan: COD-1 -> log\n\n',
      { at: '2026-10-04 09:00:02', message: 'plan: COD-1 -> log' }
    ],
    ['', undefined],
    ['not a log line\n', undefined]
  ])('%j', (text, expected) => {
    expect(lastSchedulerLine(text)).toEqual(expected);
  });
});

describe('tailLines', () => {
  it.each([
    ['a\nb\nc\n', 2, ['b', 'c']],
    ['a\nb\nc\n\n\n', 5, ['a', 'b', 'c']],
    ['a\nb', 1, ['b']],
    ['', 3, []]
  ])('%j last %i', (text, n, expected) => {
    expect(tailLines(text, n)).toEqual(expected);
  });
});

describe('launchPath', () => {
  it('puts the given dirs first and the system dirs after, without repeats', () => {
    expect(
      launchPath(['/opt/homebrew/bin', '/usr/bin', '/opt/homebrew/bin'])
    ).toBe('/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin');
  });

  it('is the system dirs alone for no dirs', () => {
    expect(launchPath([])).toBe('/usr/bin:/bin:/usr/sbin:/sbin');
  });
});

describe('drift', () => {
  it.each([
    [undefined, 'a', 'missing'],
    ['a', 'a', 'current'],
    ['a', 'b', 'stale']
  ] as const)('%s vs %s -> %s', (installed, source, expected) => {
    expect(drift(installed, source)).toBe(expected);
  });
});

describe('filesDrift', () => {
  const source = {
    'run.sh': 'a',
    'implement.sh': 'i',
    'github-app.sh': 'g',
    'checkin.sh': 'k',
    'lib.sh': 'c',
    'waits.sh': 'd',
    'watch.jq': 'b',
    'notify.sh': 'n',
    'telemetry.sh': 't'
  };

  const all = {
    'run.sh': 'a',
    'implement.sh': 'i',
    'github-app.sh': 'g',
    'checkin.sh': 'k',
    'lib.sh': 'c',
    'waits.sh': 'd',
    'watch.jq': 'b',
    'notify.sh': 'n',
    'telemetry.sh': 't'
  };

  it.each([
    [all, 'current'],
    [{ ...all, 'watch.jq': undefined }, 'missing'],
    [{ ...all, 'lib.sh': undefined }, 'missing'],
    [{ ...all, 'implement.sh': undefined }, 'missing'],
    [{ ...all, 'waits.sh': undefined }, 'missing'],
    [{ ...all, 'github-app.sh': undefined }, 'missing'],
    [{ ...all, 'notify.sh': undefined }, 'missing'],
    [{ ...all, 'telemetry.sh': undefined }, 'missing'],
    [{ ...all, 'notify.sh': 'x' }, 'stale'],
    [{ ...all, 'telemetry.sh': 'x' }, 'stale'],
    [{ ...all, 'run.sh': undefined, 'watch.jq': 'x' }, 'missing'],
    [{ ...all, 'watch.jq': 'x' }, 'stale'],
    [{ ...all, 'implement.sh': 'x' }, 'stale'],
    [{ ...all, 'waits.sh': 'x' }, 'stale'],
    [{ ...all, 'github-app.sh': 'x' }, 'stale'],
    [{ ...all, 'lib.sh': 'x' }, 'stale'],
    [{ ...all, 'run.sh': 'x', 'watch.jq': undefined }, 'missing']
  ] as const)('%j -> %s', (installed, expected) => {
    expect(filesDrift(installed, source)).toBe(expected);
  });
});

describe('parseWatchState', () => {
  it.each([undefined, '', 'not json', '[]', '"x"', 'null', '{}'])(
    'reads %j as nothing',
    (text) => {
      expect(parseWatchState(text)).toEqual([]);
    }
  );

  it('keeps well-formed entries sorted by ticket number', () => {
    const text = JSON.stringify({
      'COD-525': { pr: 569, state: 'merged', removedAt: null },
      'COD-1000': { pr: 9, state: 'open' },
      'COD-524': { pr: 570, state: 'failing' }
    });
    expect(parseWatchState(text)).toEqual([
      { ticket: 'COD-524', pr: 570, state: 'failing' },
      { ticket: 'COD-525', pr: 569, state: 'merged' },
      { ticket: 'COD-1000', pr: 9, state: 'open' }
    ]);
  });

  it('drops entries with the wrong shape', () => {
    const text = JSON.stringify({
      'COD-1': { pr: '12', state: 'open' },
      'COD-2': { pr: 12, state: 'weird' },
      'COD-3': 'merged',
      'COD-4': { state: 'open' },
      'COD-5': { pr: 5, state: 'queued' }
    });
    expect(parseWatchState(text)).toEqual([
      { ticket: 'COD-5', pr: 5, state: 'queued' }
    ]);
  });
});

describe('formatWatching', () => {
  it('counts merged and lists open PRs', () => {
    expect(
      formatWatching([
        { ticket: 'COD-524', pr: 570, state: 'open' },
        { ticket: 'COD-525', pr: 569, state: 'open' },
        { ticket: 'COD-526', pr: 568, state: 'merged' }
      ])
    ).toBe('3 PRs: 2 open (COD-524 #570, COD-525 #569), 1 merged');
  });

  it('lists every unfinished state with ticket and PR', () => {
    expect(formatWatching([{ ticket: 'COD-9', pr: 4, state: 'failing' }])).toBe(
      '1 PR: 1 failing (COD-9 #4)'
    );
  });

  it('is empty for no entries', () => {
    expect(formatWatching([])).toBe('');
  });
});

describe('summarizeSchedulerLine', () => {
  it.each([
    [
      'watch: action COD-574 merged: hand-offs left: After deploy, run it',
      'watch · action COD-574 merged: hand-offs left'
    ],
    [
      'watch: action COD-524: PR #570 has failing checks',
      'watch · action COD-524: PR #570 has failing checks'
    ],
    [
      'watch: action COD-524: PR #570 left the merge queue (merge conflict)',
      'watch · action COD-524: PR #570 left the merge queue (merge conflic…'
    ],
    [
      'watch: info COD-524: PR #570 merged',
      'watch · info COD-524: PR #570 merged'
    ],
    [
      'implement: warn: could not settle the spend ledger',
      'implement warn · could not settle the spend ledger'
    ],
    ['plan: COD-579 → /path/log', 'plan · COD-579 → /path/log'],
    [
      'attended: session polling · idle: waits on something',
      'attended · session polling'
    ],
    [
      'implement: fail: claude exited 1 (see /x.log)',
      'implement fail · claude exited 1 (see /x.log)'
    ],
    ['implement: done: COD-579 ($2.10)', 'implement done · COD-579 ($2.10)'],
    [
      'plan: COD-579 COD-580 → /very/long/path/to/the/logs/2026-10-16_1200.log',
      'plan · COD-579 COD-580 → /very/long/path/to/the/logs/2026-10-16_12…'
    ],
    [
      'fail: SHA-256 mismatch for COD-579; not starting',
      'fail · SHA-256 mismatch for COD-579; not starting'
    ],
    [
      'warn: watch: could not read PR #570 (COD-524)',
      'warn · watch · could not read PR #570 (COD-524)'
    ],
    [
      'warn: watch: watch.jq failed on COD-524)',
      'warn · watch · watch.jq failed on COD-524'
    ],
    ['', '']
  ])('%j -> %j', (message, expected) => {
    expect(summarizeSchedulerLine(message)).toBe(expected);
  });

  it('cuts a long detail', () => {
    const out = summarizeSchedulerLine(`note: ${'x'.repeat(100)}`);
    expect(out).toBe(`note · ${'x'.repeat(59)}…`);
  });
});

describe('parseCheck', () => {
  it.each([
    ['idle: nothing to plan', 'idle', []],
    ['would plan one of: COD-1 COD-2 ', 'ready', ['COD-1', 'COD-2']],
    ['busy: a run is in progress', 'busy', []],
    [
      'skip: no Linear API key in Keychain (service linear-agent-queue)',
      'skip',
      []
    ],
    ['something else', 'unknown', []],
    ['', 'unknown', []]
  ])('%j -> %s', (line, kind, tickets) => {
    const result = parseCheck(line);
    expect(result.kind).toBe(kind);
    expect(result.tickets).toEqual(tickets);
    expect(result.text).toBe(line.trim());
  });
});

describe('parseAttended', () => {
  it.each([
    ['running: COD-545 · step 4 of 5', 'running', 'COD-545'],
    ['running: COD-545', 'running', 'COD-545'],
    ['run now: COD-543 answered', 'run', 'COD-543'],
    ['run now: COD-544 review feedback', 'run', 'COD-544'],
    ['run now: COD-546 ready', 'run', 'COD-546'],
    ['run now: take over COD-540 (claim 3 h old)', 'run', 'COD-540'],
    ['run now: take over COD-540 (no claim)', 'run', 'COD-540'],
    [
      'idle: waits on COD-1 input, COD-2 PR, COD-3 hand-offs; limit 3/5',
      'idle',
      undefined
    ],
    ['idle: nothing waiting; limit 0/5', 'idle', undefined],
    ['garbage', 'unknown', undefined],
    ['', 'unknown', undefined]
  ])('%j -> %s', (line, kind, ticket) => {
    const result = parseAttended(line);
    expect(result.kind).toBe(kind);
    expect(result.ticket).toBe(ticket);
    expect(result.text).toBe(line.trim());
  });
});

describe('parseLinear', () => {
  it.each([
    ['ok (key)', 'ok', 'ok, key mode'],
    ['ok (connector)', 'ok', 'ok, connector mode'],
    [
      "missing (key: Linear's MCP answered 401)",
      'missing',
      "key: Linear's MCP answered 401"
    ],
    [
      'missing (connector: the claude.ai Linear connector is not connected)',
      'missing',
      'connector: the claude.ai Linear connector is not connected'
    ],
    ['garbage', 'unknown', 'garbage'],
    ['', 'unknown', '']
  ])('%j -> %s', (line, kind, text) => {
    expect(parseLinear(line)).toEqual({ kind, text });
  });
});

describe('parseSuggest', () => {
  it.each([
    ['due (focus dx)', 'due', 'dx', undefined],
    ['due (focus maintenance)', 'due', 'maintenance', undefined],
    ['done today', 'done', undefined, undefined],
    ['not before 06:00', 'early', undefined, undefined],
    ['skipped, COD-580 is open', 'skipped', undefined, 'COD-580'],
    ['off', 'off', undefined, undefined],
    ['garbage', 'unknown', undefined, undefined],
    ['', 'unknown', undefined, undefined]
  ])('%j -> %s', (line, kind, focus, ticket) => {
    const result = parseSuggest(line);
    expect(result.kind).toBe(kind);
    expect(result.focus).toBe(focus);
    expect(result.ticket).toBe(ticket);
    expect(result.text).toBe(line.trim());
  });
});

describe('suggestSettings', () => {
  it('defaults without the environment', () => {
    expect(suggestSettings({})).toEqual({ budgetUsd: 5, hour: 6, days: 1 });
  });

  it('takes the environment, 0 days switching it off', () => {
    expect(
      suggestSettings({
        AGENT_QUEUE_SUGGEST_BUDGET_USD: '3',
        AGENT_QUEUE_SUGGEST_HOUR: '7',
        AGENT_QUEUE_SUGGEST_DAYS: '0'
      })
    ).toEqual({ budgetUsd: 3, hour: 7, days: 0 });
  });

  it('names the variable that is not a non-negative integer', () => {
    expect(() =>
      suggestSettings({ AGENT_QUEUE_SUGGEST_DAYS: 'weekly' })
    ).toThrow('AGENT_QUEUE_SUGGEST_DAYS');
    expect(() => suggestSettings({ AGENT_QUEUE_SUGGEST_HOUR: '-1' })).toThrow(
      'AGENT_QUEUE_SUGGEST_HOUR'
    );
  });

  it('keeps the hour within a day', () => {
    expect(() => suggestSettings({ AGENT_QUEUE_SUGGEST_HOUR: '24' })).toThrow(
      'AGENT_QUEUE_SUGGEST_HOUR'
    );
    expect(suggestSettings({ AGENT_QUEUE_SUGGEST_HOUR: '23' }).hour).toBe(23);
  });
});

describe('installedEnv', () => {
  it('reads the suggest values and the memory directory the plist carries', () => {
    const plist = renderPlist({
      script: '/h/.cdwr/agent-queue/run.sh',
      home: '/h/.cdwr/agent-queue',
      repo: '/w/codeware-agent',
      path: '/opt/homebrew/bin:/usr/bin',
      memoryDir: '/h/.claude/projects/-w-dev/memory',
      suggest: { budgetUsd: 3, hour: 7, days: 0 }
    });
    expect(installedEnv(plist)).toMatchObject({
      AGENT_QUEUE_SUGGEST_BUDGET_USD: '3',
      AGENT_QUEUE_SUGGEST_HOUR: '7',
      AGENT_QUEUE_SUGGEST_DAYS: '0',
      AGENT_QUEUE_MEMORY_DIR: '/h/.claude/projects/-w-dev/memory'
    });
    expect(Object.keys(installedEnv(plist))).not.toContain('PATH');
  });

  it('is empty for no plist', () => {
    expect(installedEnv('')).toEqual({});
  });
});

describe('memoryDir', () => {
  it('names the project directory after the repo path', () => {
    expect(memoryDir('/Users/h', '/Users/h/Work/gh-repos/codeware-dev')).toBe(
      '/Users/h/.claude/projects/-Users-h-Work-gh-repos-codeware-dev/memory'
    );
  });

  it('replaces every character that is not a letter or digit', () => {
    expect(memoryDir('/Users/h', '/Users/h/Work/my.repo_x')).toBe(
      '/Users/h/.claude/projects/-Users-h-Work-my-repo-x/memory'
    );
  });
});

const EMPTY_VIEW: QueueView = {
  at: '2026-10-11T17:04:38Z',
  limit: { used: 0, max: 5 },
  session: null,
  next: [],
  held: { tickets: [], free: [] },
  parked: [],
  table: { before: [], after: [], label: [] }
};

const FILLED_VIEW: QueueView = {
  ...EMPTY_VIEW,
  session: {
    state: 'alive',
    detail: 'working',
    id: 'abc',
    ticket: 'COD-1',
    lastSeen: '2026-10-11T17:00:00Z'
  },
  next: [
    { ticket: 'COD-1', reason: 'resume', detail: 'step 2' },
    { ticket: 'COD-2', reason: 'answered', detail: null }
  ],
  held: {
    tickets: ['COD-9', 'COD-8'],
    free: [
      { action: 'review', ticket: 'COD-1', pr: 5 },
      { action: 'wait', ticket: 'COD-6', pr: 9 },
      { action: 'limit', value: 3 }
    ]
  },
  parked: [
    {
      ticket: 'COD-6',
      wait: 'ci',
      pr: 9,
      since: '2026-10-11T16:20:00Z',
      resolved: true,
      outcome: 'success'
    },
    {
      ticket: 'COD-7',
      wait: 'copilot',
      pr: 12,
      since: '2026-10-11T16:40:00Z',
      resolved: false,
      outcome: null
    }
  ],
  table: {
    before: [
      { ticket: 'COD-4', kind: 'plan' },
      { ticket: 'COD-5', kind: 'question' }
    ],
    after: [
      { ticket: 'COD-3', kind: 'pr', pr: 7 },
      { ticket: 'COD-2', kind: 'handoffs', items: ['a', 'b'] }
    ],
    label: [
      { ticket: 'COD-8', parent: 'COD-100', blockers: ['COD-3'] },
      { ticket: 'COD-9', parent: 'COD-100', blockers: ['COD-2', 'COD-3'] }
    ]
  }
};

describe('parseQueueView', () => {
  it('reads a valid view', () => {
    expect(parseQueueView(JSON.stringify(FILLED_VIEW))).toEqual(FILLED_VIEW);
    expect(parseQueueView(JSON.stringify(EMPTY_VIEW))).toEqual(EMPTY_VIEW);
  });

  it('reads a view from before parked existed', () => {
    const { parked: _parked, ...old } = EMPTY_VIEW;
    expect(parseQueueView(JSON.stringify(old))).toEqual(EMPTY_VIEW);
  });

  it('reads a view from before label existed', () => {
    const { label: _label, ...table } = EMPTY_VIEW.table;
    expect(parseQueueView(JSON.stringify({ ...EMPTY_VIEW, table }))).toEqual(
      EMPTY_VIEW
    );
  });

  // The desk keeps the rest of the view too; one bad entry must not cost the status its queue
  it('drops a malformed label entry alone and keeps a null parent', () => {
    const view = parseQueueView(
      JSON.stringify({
        ...EMPTY_VIEW,
        table: {
          ...EMPTY_VIEW.table,
          label: [
            { ticket: 'COD-8', parent: null, blockers: ['COD-3'] },
            { ticket: 42 }
          ]
        }
      })
    );
    expect(view?.table.label).toEqual([
      { ticket: 'COD-8', parent: null, blockers: ['COD-3'] }
    ]);
    expect(formatTable(view!)).toBe('label: COD-8');
  });

  it('is undefined for malformed JSON', () => {
    expect(parseQueueView('{"at": ')).toBeUndefined();
    expect(parseQueueView('')).toBeUndefined();
  });

  it('is undefined for the wrong shape', () => {
    expect(parseQueueView('[]')).toBeUndefined();
    expect(parseQueueView('null')).toBeUndefined();
    expect(parseQueueView(JSON.stringify({ ...EMPTY_VIEW, limit: 5 }))).toBe(
      undefined
    );
    expect(
      parseQueueView(
        JSON.stringify({
          ...EMPTY_VIEW,
          held: { tickets: [], free: [{ action: 'nap' }] }
        })
      )
    ).toBeUndefined();
  });
});

describe('formatNext', () => {
  it('lists ticket, reason and detail', () => {
    expect(formatNext(FILLED_VIEW)).toBe(
      'COD-1 resume (step 2), COD-2 answered'
    );
  });

  it('says nothing when empty', () => {
    expect(formatNext(EMPTY_VIEW)).toBe('nothing');
  });
});

describe('formatHeld', () => {
  it('lists held tickets and what frees a slot', () => {
    expect(formatHeld(FILLED_VIEW)).toBe(
      'COD-9, COD-8; free a slot: review COD-1 (#5), wait COD-6 (#9), limit=3'
    );
  });

  it('leaves out the PR when unknown and the slots when none', () => {
    expect(
      formatHeld({
        ...EMPTY_VIEW,
        held: {
          tickets: ['COD-9'],
          free: [{ action: 'review', ticket: 'COD-3', pr: null }]
        }
      })
    ).toBe('COD-9; free a slot: review COD-3');
    expect(
      formatHeld({ ...EMPTY_VIEW, held: { tickets: ['COD-9'], free: [] } })
    ).toBe('COD-9');
  });

  it('says nothing when empty', () => {
    expect(formatHeld(EMPTY_VIEW)).toBe('nothing');
  });
});

describe('formatParked', () => {
  it('lists the waits, marking resolved ones', () => {
    expect(formatParked(FILLED_VIEW)).toBe(
      'COD-6 ci PR #9 since 16:20Z (resolved: success), COD-7 copilot PR #12 since 16:40Z'
    );
  });

  it('says nothing when empty', () => {
    expect(formatParked(EMPTY_VIEW)).toBe('nothing');
  });
});

describe('formatTable', () => {
  it('lists what waits before and after', () => {
    expect(formatTable(FILLED_VIEW)).toBe(
      'before: COD-4 plan, COD-5 question · after: COD-3 PR #7, COD-2 hand-offs (2) · label: COD-8 (COD-100), COD-9 (COD-100)'
    );
  });

  it('lists only the sub-issues to label', () => {
    expect(
      formatTable({
        ...EMPTY_VIEW,
        table: {
          before: [],
          after: [],
          label: [{ ticket: 'COD-8', parent: 'COD-100', blockers: ['COD-3'] }]
        }
      })
    ).toBe('label: COD-8 (COD-100)');
  });

  it('leaves out an empty side', () => {
    expect(
      formatTable({
        ...EMPTY_VIEW,
        table: {
          before: [{ ticket: 'COD-4', kind: 'plan' }],
          after: [],
          label: []
        }
      })
    ).toBe('before: COD-4 plan');
  });

  it('says nothing when empty', () => {
    expect(formatTable(EMPTY_VIEW)).toBe('nothing');
  });
});

describe('implement spend', () => {
  const row = (day: string, cost: unknown) =>
    JSON.stringify({ day, ticket: 'COD-1', cost });

  it('sums only the given day', () => {
    const ledger = [
      row('2026-10-11', 1.5),
      row('2026-10-10', 9),
      row('2026-10-11', 1.7)
    ].join('\n');
    expect(spendForDay(ledger, '2026-10-11')).toBeCloseTo(3.2);
  });

  it('sums a negative correction row', () => {
    const ledger = [row('2026-10-11', 5), row('2026-10-11', -3.5)].join('\n');
    expect(spendForDay(ledger, '2026-10-11')).toBeCloseTo(1.5);
  });

  it('is zero for a missing or empty ledger', () => {
    expect(spendForDay(undefined, '2026-10-11')).toBe(0);
    expect(spendForDay('', '2026-10-11')).toBe(0);
    expect(spendForDay('\n\n', '2026-10-11')).toBe(0);
  });

  it.each([
    ['not json'],
    ['[1]'],
    [row('2026-10-11', 'x')],
    [row('2026-10-11', null)],
    ['{"day":"2026-10-11"}']
  ])('is unreadable with the bad line %j', (bad) => {
    const ledger = [row('2026-10-11', 1), bad].join('\n');
    expect(spendForDay(ledger, '2026-10-11')).toBeUndefined();
  });

  it.each([
    [undefined, 40],
    ['', 40],
    ['abc', 40],
    ['-5', 40],
    ['25', 25]
  ])('cap %j is %i', (value, expected) => {
    expect(implementCap(value)).toBe(expected);
  });

  it.each([
    [undefined, 15],
    ['0', 15],
    ['abc', 15],
    ['20', 20]
  ])('budget %j is %i', (value, expected) => {
    expect(implementBudget(value)).toBe(expected);
  });

  it('reads the last implementing row', () => {
    const runs = [
      '{"when":"a","outcome":"implemented","ticket":"COD-1"}',
      '{"when":"b","outcome":"skip","ticket":""}',
      '{"when":"c","outcome":"cap","ticket":"COD-2"}',
      '{"when":"d","outcome":"planned","ticket":"COD-3"}'
    ].join('\n');
    expect(lastImplementRun(runs)).toEqual({
      when: 'c',
      outcome: 'cap',
      ticket: 'COD-2'
    });
    expect(lastImplementRun('')).toBeUndefined();
  });

  it('formats the line', () => {
    expect(
      formatImplement(3.2, 40, {
        when: '2026-10-11 09:00',
        outcome: 'implemented',
        ticket: 'COD-1'
      })
    ).toBe(
      'implement spend today $3.20 of $40, last implemented COD-1 (2026-10-11 09:00)'
    );
    expect(formatImplement(0, 40, undefined)).toBe(
      'implement spend today $0.00 of $40, no implementing session yet'
    );
  });

  it.each([
    [39.99, ''],
    [40, ' (over; a run may overshoot by its $15 budget)'],
    [44.76, ' (over; a run may overshoot by its $15 budget)']
  ])('marks spend %s against the cap', (spent, over) => {
    expect(formatImplement(spent, 40, undefined, 15)).toBe(
      `implement spend today $${spent.toFixed(2)} of $40${over}, no implementing session yet`
    );
  });

  it('warns when the ledger is unreadable', () => {
    expect(formatImplement(undefined, 40, undefined)).toBe(
      'implement spend unreadable: implement-spend.jsonl has a bad line; no launch until it is fixed'
    );
  });

  it('reads the PATH from an installed plist', () => {
    const plist = renderPlist({
      script: '/h/run.sh',
      home: '/h',
      repo: '/r',
      path: '/a&b/bin:/usr/bin',
      memoryDir: '/m',
      suggest: { budgetUsd: 5, hour: 6, days: 1 }
    });
    expect(plistPath(plist)).toBe('/a&b/bin:/usr/bin');
  });

  it.each([
    [undefined],
    [''],
    ['<plist><dict><key>Label</key><string>x</string></dict></plist>'],
    [
      '<key>EnvironmentVariables</key><dict><key>PATH</key><string> </string></dict>'
    ]
  ])('has no plist PATH in %j', (plist) => {
    expect(plistPath(plist)).toBeUndefined();
  });

  it.each([
    ['v22.3.0\n', 22],
    ['v20.1.0', 20],
    ['nope', undefined]
  ])('reads node major from %j', (text, expected) => {
    expect(nodeMajor(text)).toBe(expected);
  });
});

describe('remote logs', () => {
  it('lists the container log folder over ssh, one argv entry per word', () => {
    expect(remoteListLogs('agent-host')).toEqual([
      'agent-host',
      'docker',
      'exec',
      'cdwr-agent',
      'ls',
      '-1',
      '/home/agent/.cdwr/agent-queue/logs'
    ]);
  });

  it('picks the scheduler log, or the newest run log', () => {
    const names = [
      '2026-10-18_0900.log',
      '2026-10-19_0810.log',
      'scheduler.log'
    ];
    expect(remoteLogFile(false, names)).toBe(
      '/home/agent/.cdwr/agent-queue/logs/scheduler.log'
    );
    expect(remoteLogFile(true, names)).toBe(
      '/home/agent/.cdwr/agent-queue/logs/2026-10-19_0810.log'
    );
    expect(remoteLogFile(true, ['scheduler.log'])).toBeUndefined();
  });

  it('tails, or cats for 0 lines', () => {
    const file = '/f.log';
    expect(remoteReadLog('h', file, 25).slice(4)).toEqual([
      'tail',
      '-n',
      '25',
      file
    ]);
    expect(remoteReadLog('h', file, 0).slice(4)).toEqual(['cat', file]);
  });
});
