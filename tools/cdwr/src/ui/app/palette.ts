import type { Danger } from '../../cli/command';

/** Colours for Ink `Text`, matching the chalk theme */
export const colors = {
  brand: '#f59e0b',
  border: '#6b7280',
  muted: '#9ca3af',
  ok: '#22c55e',
  warn: '#eab308',
  danger: '#ef4444',
  accent: '#22d3ee'
} as const;

export const dangerColor = (danger: Danger): string => {
  switch (danger) {
    case 'read':
      return colors.muted;
    case 'mutate':
      return colors.warn;
    default:
      return colors.danger;
  }
};

export const dangerLabel = (danger: Danger): string => {
  switch (danger) {
    case 'read':
      return 'read-only';
    case 'mutate':
      return 'changes things';
    case 'destructive':
      return 'destructive';
    case 'spends-money':
      return 'spends money';
  }
};
