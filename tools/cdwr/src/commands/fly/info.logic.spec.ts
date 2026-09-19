import { plain } from '../../ui/theme';

import {
  type AppSummary,
  type FlyMachine,
  compactState,
  detailLines,
  formatBytes,
  formatUptime,
  getLastStartMs,
  resourceString,
  stateLegend,
  summaryRow
} from './info.logic';

const machine = (overrides: Partial<FlyMachine> = {}): FlyMachine =>
  ({
    id: 'm1',
    name: 'app-01',
    state: 'started',
    region: 'arn',
    imageRef: {
      registry: 'registry.fly.io',
      repository: 'app',
      tag: 'deployment-1',
      digest: 'sha256:abc'
    },
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    config: { env: {}, metadata: {}, guest: { cpus: 1, memory_mb: 512 } },
    events: [],
    hostStatus: 'ok',
    ...overrides
  }) as FlyMachine;

describe('formatBytes', () => {
  it('shows megabytes below a gigabyte', () => {
    expect(formatBytes(512)).toBe('512 MB');
  });

  it('shows gigabytes at or above 1024', () => {
    expect(formatBytes(2048)).toBe('2.0 GB');
  });
});

describe('formatUptime', () => {
  const now = new Date('2026-09-19T12:00:00.000Z').getTime();
  beforeEach(() => vi.setSystemTime(now));
  afterEach(() => vi.useRealTimers());

  it('falls back to a dash for a non-finite timestamp', () => {
    expect(formatUptime(NaN)).toBe('-');
  });

  it('shows minutes under an hour', () => {
    expect(formatUptime(now - 5 * 60 * 1000)).toBe('5m');
  });

  it('shows hours and minutes under a day', () => {
    expect(formatUptime(now - (2 * 60 * 60 * 1000 + 15 * 60 * 1000))).toBe(
      '2h 15m'
    );
  });

  it('shows days and hours at or beyond a day', () => {
    expect(formatUptime(now - 25 * 60 * 60 * 1000)).toBe('1d 1h');
  });
});

describe('getLastStartMs', () => {
  it('uses the latest start event, guarding seconds against milliseconds', () => {
    const inSeconds = 1_790_000_000; // clearly below the 1e12 guard
    const m = machine({
      events: [
        { type: 'start', status: 'ok', timestamp: inSeconds },
        { type: 'stop', status: 'ok', timestamp: inSeconds + 1000 }
      ]
    });
    expect(getLastStartMs(m)).toBe(inSeconds * 1000);
  });

  it('takes a millisecond timestamp as-is', () => {
    const inMs = 1_790_000_000_000;
    const m = machine({
      events: [{ type: 'start', status: 'ok', timestamp: inMs }]
    });
    expect(getLastStartMs(m)).toBe(inMs);
  });

  it('falls back to createdAt when there is no start event', () => {
    const m = machine({ createdAt: '2026-01-01T00:00:00.000Z', events: [] });
    expect(getLastStartMs(m)).toBe(Date.parse('2026-01-01T00:00:00.000Z'));
  });
});

describe('compactState', () => {
  it('maps known states to their glyph', () => {
    expect(plain(compactState('started'))).toBe('●');
    expect(plain(compactState('suspended'))).toBe('○');
    expect(plain(compactState('stopped'))).toBe('○');
    expect(plain(compactState('starting'))).toBe('◐');
    expect(plain(compactState('stopping'))).toBe('◑');
    expect(plain(compactState('created'))).toBe('◌');
    expect(plain(compactState('destroyed'))).toBe('✕');
  });

  it('falls back to a question mark for an unknown state', () => {
    expect(plain(compactState('whatever'))).toBe('?');
  });
});

describe('resourceString', () => {
  it('shows a dash when nothing is set', () => {
    expect(resourceString(undefined)).toBe('-');
    expect(resourceString({})).toBe('-');
  });

  it('abbreviates cpu kind and shows sub-gigabyte memory in M', () => {
    expect(
      resourceString({ cpu_kind: 'shared', cpus: 1, memory_mb: 256 })
    ).toBe('sh×1 256M');
  });

  it('abbreviates performance cpus and shows gigabyte memory in G', () => {
    expect(
      resourceString({ cpu_kind: 'performance', cpus: 2, memory_mb: 2048 })
    ).toBe('pf×2 2G');
  });

  it('defaults missing cpu/memory fields', () => {
    expect(resourceString({ cpus: 1 })).toBe('sh×1 256M');
  });
});

describe('summaryRow', () => {
  it('maps a summary to a table row', () => {
    const summary: AppSummary = {
      name: 'cdwr-cms',
      deployed: true,
      hostname: 'cdwr-cms.fly.dev',
      version: 3,
      organization: 'codeware',
      machines: [machine({ state: 'started' }), machine({ state: 'stopped' })],
      certs: [{ hostname: 'cdwr.dev', clientStatus: 'Ready' }],
      secretNames: ['DATABASE_URL']
    };
    const row = summaryRow(summary);
    expect(row[0]).toBe('cdwr-cms');
    expect(row[1]).toBe('UP');
    expect(plain(row[2])).toBe('● ○');
    expect(row[3]).toBe('sh×1 512M');
    expect(row[4]).not.toBe('-');
    expect(row[5]).toBe('1');
    expect(row[6]).toBe('1');
  });

  it('shows a dash uptime when no machine has a finite start', () => {
    const summary: AppSummary = {
      name: 'cdwr-cms',
      deployed: false,
      hostname: 'cdwr-cms.fly.dev',
      version: 1,
      organization: 'codeware',
      machines: [],
      certs: [],
      secretNames: []
    };
    expect(summaryRow(summary)[4]).toBe('-');
  });
});

describe('stateLegend', () => {
  it('explains every glyph, stripped of colour', () => {
    expect(stateLegend().map(plain)).toEqual([
      '● started',
      '○ suspended / stopped',
      '◐ starting / stopping',
      '◌ created',
      '✕ destroyed',
      '? unknown'
    ]);
  });
});

describe('detailLines', () => {
  it('lists the overview, machines, certs and secrets', () => {
    const summary: AppSummary = {
      name: 'cdwr-cms',
      deployed: true,
      hostname: 'cdwr-cms.fly.dev',
      version: 3,
      organization: 'codeware',
      machines: [
        machine({
          checks: [
            { name: 'health', status: 'passing', output: '', updatedAt: '' }
          ]
        })
      ],
      certs: [{ hostname: 'cdwr.dev', clientStatus: 'Ready' }],
      secretNames: ['DATABASE_URL']
    };
    const lines = detailLines(summary).map(plain);
    expect(lines[0]).toContain('cdwr-cms.fly.dev — version 3, org codeware');
    expect(lines.some((l) => l.includes('Image: app:deployment-1'))).toBe(true);
    expect(lines.some((l) => l.includes('Resources: sh×1 512M'))).toBe(true);
    expect(lines.some((l) => l.includes('Health: 1/1 checks passing'))).toBe(
      true
    );
    expect(lines.some((l) => l.includes('Certificates (1):'))).toBe(true);
    expect(lines.some((l) => l.includes('cdwr.dev (Ready)'))).toBe(true);
    expect(lines[lines.length - 1]).toBe('Secrets (1): DATABASE_URL');
  });

  it('shows "none" when there are no secrets', () => {
    const summary: AppSummary = {
      name: 'cdwr-cms',
      deployed: false,
      hostname: 'cdwr-cms.fly.dev',
      version: 1,
      organization: 'codeware',
      machines: [],
      certs: [],
      secretNames: []
    };
    const lines = detailLines(summary).map(plain);
    expect(lines[lines.length - 1]).toBe('Secrets (0): none');
  });
});
