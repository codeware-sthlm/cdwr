import {
  KEYCHAIN_SERVICE,
  LABEL,
  QUEUE_FILES,
  QUEUE_SOURCE_DIR,
  STALE_LOCK_MS,
  domainTarget,
  drift,
  filesDrift,
  formatWatching,
  lastSchedulerLine,
  latestRunLog,
  launchPath,
  lockState,
  parseCheck,
  parseLaunchctlPrint,
  parseNotifyLevel,
  parseWatchState,
  queuePaths,
  renderPlist,
  serviceTarget,
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
    expect(QUEUE_FILES).toEqual(['run.sh', 'watch.jq']);
  });
});

describe('queuePaths', () => {
  it('puts everything under the cdwr home, the plist under the user home', () => {
    expect(queuePaths('/h/.cdwr', '/h')).toEqual({
      home: '/h/.cdwr/agent-queue',
      script: '/h/.cdwr/agent-queue/run.sh',
      files: {
        'run.sh': '/h/.cdwr/agent-queue/run.sh',
        'watch.jq': '/h/.cdwr/agent-queue/watch.jq'
      },
      watchState: '/h/.cdwr/agent-queue/watch.json',
      paused: '/h/.cdwr/agent-queue/paused',
      notifyLevel: '/h/.cdwr/agent-queue/notify-level',
      lock: '/h/.cdwr/agent-queue/lock',
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
    path: '/opt/homebrew/bin:/usr/bin'
  };

  it('describes the job', () => {
    const plist = renderPlist(input);
    expect(plist).toContain('<string>se.codeware.agent-queue</string>');
    expect(plist).toContain('<string>/bin/zsh</string>');
    expect(plist).toContain('<string>/h/.cdwr/agent-queue/run.sh</string>');
    expect(plist).toContain('<integer>600</integer>');
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
      path: "/it's"
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
  const source = { 'run.sh': 'a', 'watch.jq': 'b' };

  it.each([
    [{ 'run.sh': 'a', 'watch.jq': 'b' }, 'current'],
    [{ 'run.sh': 'a', 'watch.jq': undefined }, 'missing'],
    [{ 'run.sh': undefined, 'watch.jq': 'x' }, 'missing'],
    [{ 'run.sh': 'a', 'watch.jq': 'x' }, 'stale'],
    [{ 'run.sh': 'x', 'watch.jq': undefined }, 'missing']
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
  it('lists ticket, PR and state', () => {
    expect(
      formatWatching([
        { ticket: 'COD-524', pr: 570, state: 'merged' },
        { ticket: 'COD-525', pr: 569, state: 'merged' }
      ])
    ).toBe('COD-524 #570 merged, COD-525 #569 merged');
  });

  it('is empty for no entries', () => {
    expect(formatWatching([])).toBe('');
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
