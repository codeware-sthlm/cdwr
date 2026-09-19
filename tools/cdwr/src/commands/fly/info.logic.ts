import type { StatusResponse } from '@cdwr/fly-node';

import { symbols, theme } from '../../ui/theme';

export type FlyMachine = StatusResponse['machines'][number];

export interface CertSummary {
  hostname: string;
  clientStatus: string;
}

/** Everything shown for one app, whether in the table or the detail block */
export interface AppSummary {
  name: string;
  deployed: boolean;
  hostname: string;
  version: number;
  organization: string;
  machines: FlyMachine[];
  certs: CertSummary[];
  secretNames: string[];
}

/** Megabytes as a human size; the detail block's unit, spelled out */
export function formatBytes(mb: number): string {
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb} MB`;
}

/** Time elapsed since an epoch-millisecond timestamp, coarsened to the largest unit */
export function formatUptime(sinceMs: number): string {
  if (!Number.isFinite(sinceMs)) return '-';
  const diff = Math.max(0, Date.now() - sinceMs);
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

/**
 * Timestamp (epoch ms) of a machine's most recent start, so uptime reflects
 * reboots/restarts rather than original creation. Falls back to the creation
 * time when no start event is recorded.
 */
export function getLastStartMs(
  machine: Pick<FlyMachine, 'createdAt' | 'events'>
): number {
  const starts = machine.events
    .filter((event) => event.type === 'start')
    .map((event) => event.timestamp);
  if (starts.length > 0) {
    const ts = Math.max(...starts);
    // Fly event timestamps are epoch milliseconds; guard against seconds.
    return ts < 1e12 ? ts * 1000 : ts;
  }
  return Date.parse(machine.createdAt);
}

/** A one-glyph, coloured indicator for a machine's state */
export function compactState(state: string): string {
  switch (state) {
    case 'started':
      return theme.ok('●');
    case 'suspended':
    case 'stopped':
      return theme.muted('○');
    case 'starting':
      return theme.warn('◐');
    case 'stopping':
      return theme.warn('◑');
    case 'created':
      return theme.accent('◌');
    case 'destroyed':
      return theme.danger('✕');
    default:
      return theme.muted('?');
  }
}

/** Compact "kind×cpus size" string for a table column, '-' when unknown */
export function resourceString(guest?: {
  cpu_kind?: string;
  cpus?: number;
  memory_mb?: number;
}): string {
  if (!guest?.cpus && !guest?.memory_mb) return '-';
  const cpuKind = (guest.cpu_kind ?? 'shared')
    .replace('shared', 'sh')
    .replace('performance', 'pf');
  const cpus = guest.cpus ?? 1;
  const memory = guest.memory_mb ?? 256;
  const mem = memory >= 1024 ? `${(memory / 1024).toFixed(0)}G` : `${memory}M`;
  return `${cpuKind}×${cpus} ${mem}`;
}

/** One `ctx.ui.table` row for an app summary */
export function summaryRow(summary: AppSummary): string[] {
  const starts = summary.machines
    .map(getLastStartMs)
    .filter((ms) => Number.isFinite(ms));
  return [
    summary.name,
    summary.deployed ? 'UP' : 'DOWN',
    summary.machines.map((m) => compactState(m.state)).join(' '),
    resourceString(summary.machines[0]?.config.guest),
    starts.length > 0 ? formatUptime(Math.max(...starts)) : '-',
    String(summary.certs.length),
    String(summary.secretNames.length)
  ];
}

/** What the compact state glyphs mean, for a `ctx.ui.note` under the table */
export function stateLegend(): string[] {
  return [
    `${compactState('started')} started`,
    `${compactState('suspended')} suspended / stopped`,
    `${compactState('starting')} starting / stopping`,
    `${compactState('created')} created`,
    `${compactState('destroyed')} destroyed`,
    `${compactState('unknown')} unknown`
  ];
}

/** The single-app detail block: overview, machines, certificates, secrets */
export function detailLines(summary: AppSummary): string[] {
  const lines: string[] = [
    `${summary.deployed ? symbols.ok : symbols.fail} ${summary.hostname} — version ${summary.version}, org ${summary.organization}`,
    '',
    `Machines (${summary.machines.length}):`
  ];
  for (const m of summary.machines) {
    lines.push(
      `  ${compactState(m.state)} ${m.name} (${m.region}) — ${m.state}, up ${formatUptime(getLastStartMs(m))}`
    );
    lines.push(`    Image: ${m.imageRef.repository}:${m.imageRef.tag}`);
    lines.push(`    Resources: ${resourceString(m.config.guest)}`);
    if (m.checks && m.checks.length > 0) {
      const passing = m.checks.filter((c) => c.status === 'passing').length;
      lines.push(`    Health: ${passing}/${m.checks.length} checks passing`);
    }
  }
  lines.push('', `Certificates (${summary.certs.length}):`);
  for (const cert of summary.certs) {
    lines.push(
      `  ${cert.clientStatus === 'Ready' ? symbols.ok : symbols.warn} ${cert.hostname} (${cert.clientStatus})`
    );
  }
  lines.push(
    '',
    `Secrets (${summary.secretNames.length}): ${summary.secretNames.join(', ') || 'none'}`
  );
  return lines;
}
