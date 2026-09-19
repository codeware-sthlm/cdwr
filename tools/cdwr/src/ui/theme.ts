import chalk from 'chalk';

/** One palette for the whole CLI; commands never pick colours themselves */
export const theme = {
  brand: chalk.hex('#f59e0b'),
  brandDim: chalk.hex('#b45309'),
  title: chalk.bold,
  muted: chalk.dim,
  accent: chalk.cyan,
  ok: chalk.green,
  warn: chalk.yellow,
  danger: chalk.red,
  code: chalk.cyan,
  added: chalk.green,
  removed: chalk.red,
  changed: chalk.yellow
};

export const symbols = {
  ok: theme.ok('✔'),
  fail: theme.danger('✖'),
  warn: theme.warn('▲'),
  info: theme.accent('ℹ'),
  bullet: theme.muted('•'),
  arrow: theme.muted('→'),
  cloud: '☁'
};

const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g');

/** Strip ANSI so widths can be measured */
export const plain = (text: string): string => text.replace(ANSI, '');
