import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  checkArgs,
  checkFailure,
  invalidPart,
  mirrorTarget
} from './mirror.logic';

describe('mirrorTarget', () => {
  it.each([
    ['agent-host', 'cdwr-agent', '/a/b', 'agent-host:docker:cdwr-agent:/a/b'],
    ['me@h.example', 'c_1', '/x', 'me@h.example:docker:c_1:/x']
  ])('%s %s %s -> %s', (host, container, dir, expected) => {
    expect(mirrorTarget(host, container, dir)).toBe(expected);
  });
});

describe('invalidPart', () => {
  it.each([
    [{ host: 'agent-host', dir: '/home/a-b.c' }, undefined],
    [{ host: 'me@h.example:22', dir: '/x' }, undefined],
    [{ host: 'a b', dir: '/x' }, 'host'],
    [{ host: 'h', container: 'c;rm', dir: '/x' }, 'container'],
    [{ host: 'h', dir: '/x$(id)' }, 'dir'],
    [{ host: 'h', dir: '/x\n' }, 'dir'],
    [{ host: '', dir: '/x' }, 'host'],
    [{ host: '-F/tmp/x', dir: '/x' }, 'host'],
    [{ host: 'h', container: '-u0', dir: '/x' }, 'container']
  ])('%j -> %s', (parts, expected) => {
    expect(invalidPart(parts)).toBe(expected);
  });
});

describe('checkArgs', () => {
  it('runs one docker exec through ssh, making the directory before testing it', () => {
    expect(checkArgs('h', 'c', '/d')).toEqual([
      '-q',
      '-o',
      'BatchMode=yes',
      '-o',
      'ConnectTimeout=5',
      'h',
      'docker',
      'exec',
      'c',
      'sh',
      '-c',
      `'mkdir -p "$1" && test -w "$1"'`,
      '_',
      '/d'
    ]);
  });

  it('survives the remote shell that ssh hands the joined line to', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mirror-check-'));
    const nested = join(dir, 'sessions');
    // What ssh does on the far side, minus ssh and docker: one shell parses the joined arguments
    execFileSync('sh', ['-c', checkArgs('h', 'c', nested).slice(9).join(' ')]);
    expect(existsSync(nested)).toBe(true);
    rmSync(dir, { recursive: true, force: true });
  });
});

describe('checkFailure', () => {
  it.each([
    [255, '', 'h is unreachable over ssh'],
    ['killed', '', 'h is unreachable over ssh'],
    [
      1,
      'Error response from daemon: No such container: c',
      'c is not a running container on h'
    ],
    [
      1,
      'Error response from daemon: Container abc is not running',
      'c is not a running container on h'
    ],
    [1, '', '/d is not writable in c'],
    [126, 'denied\n', 'The check failed (126): denied'],
    [null, '', 'The check failed (no status)']
  ])('%s %j -> %s', (code, stderr, expected) => {
    expect(checkFailure(code, stderr, 'h', 'c', '/d')).toBe(expected);
  });
});
