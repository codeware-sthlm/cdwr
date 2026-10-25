import {
  CONTAINER,
  IMPLEMENT_LOCK,
  PAUSED,
  RUN_LOCK,
  assertHost,
  assertTag,
  headShaOf,
  isPid,
  isRunning,
  lockOld,
  lockPid,
  parseReport,
  parseRunning,
  pathExists,
  pause,
  pidAlive,
  pull,
  report,
  tagFromSha,
  unpause,
  up,
  uploadCompose,
  waitPlan,
  writeTag
} from './deploy.logic';

const composeArgs = [
  'docker',
  'compose',
  '--project-directory',
  '/opt/cdwr-agent',
  '-f',
  '/opt/cdwr-agent/compose.yaml',
  '--env-file',
  '/opt/cdwr-agent/image.env'
];

describe('tagFromSha', () => {
  it('keeps the first seven characters', () => {
    expect(tagFromSha('7A1466A5c0ffee0123456789abcdef0123456789')).toBe(
      'sha-7a1466a'
    );
  });

  it('rejects what is not a sha', () => {
    expect(() => tagFromSha('main')).toThrow('Not a commit sha');
    expect(() => tagFromSha('abc12')).toThrow('Not a commit sha');
  });
});

describe('assertTag', () => {
  it.each(['sha-7a1466a', 'main'])('accepts %s', (tag) => {
    expect(assertTag(tag)).toBe(tag);
  });

  it.each(['latest', 'sha-7a1466', 'sha-7a1466ab', 'sha-ZZZZZZZ', 'main '])(
    'rejects %j',
    (tag) => {
      expect(() => assertTag(tag)).toThrow('Not an image tag');
    }
  );
});

describe('assertHost', () => {
  it('accepts a tailscale name or user@host', () => {
    expect(assertHost('nuc')).toBe('nuc');
    expect(assertHost('cdwr@nuc.tail1234.ts.net')).toBe(
      'cdwr@nuc.tail1234.ts.net'
    );
  });

  it('rejects an option or a shell word', () => {
    expect(() => assertHost('-oProxyCommand=x')).toThrow('Not a host name');
    expect(() => assertHost('nuc; rm')).toThrow('Not a host name');
  });
});

describe('remote commands', () => {
  it('uploads the compose file on stdin', () => {
    expect(uploadCompose('nuc', 'services: {}\n')).toEqual({
      args: [
        '-o',
        'BatchMode=yes',
        'nuc',
        'tee',
        '/opt/cdwr-agent/compose.yaml'
      ],
      input: 'services: {}\n'
    });
  });

  it('writes the tag on stdin and rejects a bad one', () => {
    expect(writeTag('nuc', 'sha-7a1466a')).toEqual({
      args: ['-o', 'BatchMode=yes', 'nuc', 'tee', '/opt/cdwr-agent/image.env'],
      input: 'AGENT_IMAGE_TAG=sha-7a1466a\n'
    });
    expect(() => writeTag('nuc', 'latest')).toThrow('Not an image tag');
  });

  it('asks whether the container runs', () => {
    expect(isRunning('nuc').args.slice(2)).toEqual([
      'nuc',
      'docker',
      'inspect',
      '-f',
      '{{.State.Running}}',
      CONTAINER
    ]);
  });

  it('pauses and unpauses inside the container', () => {
    expect(pause('nuc').args.slice(3)).toEqual([
      'docker',
      'exec',
      CONTAINER,
      'touch',
      PAUSED
    ]);
    expect(unpause('nuc').args.slice(3)).toEqual([
      'docker',
      'exec',
      CONTAINER,
      'rm',
      '-f',
      PAUSED
    ]);
  });

  it('tests each lock with its own call', () => {
    expect(RUN_LOCK).toBe('/home/agent/.cdwr/agent-queue/lock');
    expect(pathExists('nuc', IMPLEMENT_LOCK).args.slice(3)).toEqual([
      'docker',
      'exec',
      CONTAINER,
      'test',
      '-e',
      '/home/agent/.cdwr/agent-queue/implement.lock'
    ]);
  });

  it('pulls and starts with the image env file', () => {
    expect(pull('nuc').args.slice(3)).toEqual([...composeArgs, 'pull']);
    expect(up('nuc').args.slice(3)).toEqual([...composeArgs, 'up', '-d']);
  });

  it('reports the image and state without a space in the format', () => {
    const format = report('nuc').args.at(-2);
    expect(format).toBe('{{.Image}}={{.State.Status}}');
    expect(format).not.toMatch(/\s/);
  });

  it('never puts a space in a word', () => {
    const all = [
      uploadCompose('nuc', ''),
      writeTag('nuc', 'main'),
      isRunning('nuc'),
      pause('nuc'),
      unpause('nuc'),
      pathExists('nuc', RUN_LOCK),
      lockPid('nuc', IMPLEMENT_LOCK),
      pidAlive('nuc', '4242'),
      lockOld('nuc', IMPLEMENT_LOCK),
      pull('nuc'),
      up('nuc'),
      report('nuc')
    ];
    for (const { args } of all) {
      for (const word of args) expect(word).not.toMatch(/\s/);
    }
  });
});

describe('pids', () => {
  it('accepts digits only', () => {
    expect(isPid('4242')).toBe(true);
    expect(isPid('')).toBe(false);
    expect(isPid('1; rm')).toBe(false);
    expect(() => pidAlive('nuc', '1 2')).toThrow();
  });
});

describe('parsers', () => {
  it('reads the report', () => {
    expect(parseReport('sha256:abc123=running\n')).toEqual({
      image: 'sha256:abc123',
      state: 'running'
    });
    expect(parseReport('nothing')).toEqual({
      image: 'nothing',
      state: 'unknown'
    });
  });

  it('reads the running flag', () => {
    expect(parseRunning('true\n')).toBe(true);
    expect(parseRunning('false\n')).toBe(false);
    expect(parseRunning('')).toBe(false);
  });

  it('reads the head sha, or nothing', () => {
    expect(headShaOf('abc1234\n')).toBe('abc1234');
    expect(headShaOf('null\n')).toBeUndefined();
    expect(headShaOf('')).toBeUndefined();
  });
});

describe('waitPlan', () => {
  it('checks every ten seconds, once more than the intervals', () => {
    expect(waitPlan(30)).toEqual({ intervalMs: 10_000, checks: 181 });
    expect(waitPlan(1)).toEqual({ intervalMs: 10_000, checks: 7 });
  });

  it('checks once for no wait', () => {
    expect(waitPlan(0).checks).toBe(1);
    expect(waitPlan(-3).checks).toBe(1);
  });
});
