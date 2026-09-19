import { banner } from '../ui/banner';
import { plain, theme } from '../ui/theme';

import { GLOBAL_FLAGS, flagUsage } from './args';
import { type AnyCommand, type Danger, confirmFor } from './command';
import { type Inputs, flagOf } from './inputs';
import type { Entry, Group } from './registry';

const column = (rows: Array<[string, string]>, indent = '  '): string => {
  const width = Math.max(0, ...rows.map(([left]) => plain(left).length));
  return rows
    .map(
      ([left, right]) =>
        `${indent}${left.padEnd(width + (left.length - plain(left).length))}  ${right}`
    )
    .join('\n');
};

const globalRows = (): Array<[string, string]> =>
  Object.entries(GLOBAL_FLAGS).map(([name, spec]) => [
    theme.code(`${'short' in spec ? `-${spec.short}, ` : ''}--${name}`),
    spec.description
  ]);

const dangerLine = (danger: Danger, confirm = confirmFor(danger)): string => {
  switch (danger) {
    case 'read':
      return theme.muted('Read-only.');
    case 'mutate':
      return confirm === 'always'
        ? theme.warn('Changes things; confirms unless --yes.')
        : confirm === 'never'
          ? theme.warn('Changes things locally; never confirms.')
          : theme.warn('Changes things; confirms on production unless --yes.');
    case 'destructive':
      return theme.danger(
        'Destructive; confirms unless --yes, and asks you to type the name on production.'
      );
    case 'spends-money':
      return theme.danger('Spends money; confirms unless --yes.');
  }
};

export function renderCommandHelp(name: string, command: AnyCommand): string {
  const inputs = Object.entries(command.inputs as Inputs);
  const positional = inputs
    .filter(([, spec]) => spec.positional)
    .map(([key, spec]) => `<${flagOf(key, spec)}>`);
  const out: string[] = [
    `${theme.title(`cdwr ${name}`)}  ${command.summary}`,
    '',
    `${theme.muted('Usage:')} cdwr ${name} ${positional.join(' ')}${positional.length ? ' ' : ''}[flags]`,
    '',
    dangerLine(command.danger, confirmFor(command.danger, command.confirm))
  ];
  if (command.description) out.push('', command.description);
  if (command.needs?.length)
    out.push('', `${theme.muted('Needs:')} ${command.needs.join(', ')}`);
  if (inputs.length) {
    out.push(
      '',
      theme.title('Inputs'),
      column(
        inputs.map(([key, spec]) => [
          theme.code(flagUsage(key, spec)),
          (spec.description ?? spec.prompt) +
            (spec.optional ? theme.muted('  (optional)') : '') +
            (spec.remember ? theme.muted('  (remembered)') : '')
        ])
      )
    );
  }
  out.push('', theme.title('Global flags'), column(globalRows()));
  return out.join('\n');
}

export function renderGroupHelp(group: Group, entries: Entry[]): string {
  return [
    `${theme.title(`cdwr ${group.name}`)}  ${group.summary}`,
    '',
    theme.title('Commands'),
    column(
      entries.map((e) => [theme.code(e.path.slice(1).join(' ')), e.summary])
    ),
    '',
    theme.muted(`cdwr ${group.name} <command> --help for the flags`)
  ].join('\n');
}

export function renderTopHelp(
  groups: Group[],
  entries: Entry[],
  version: string
): string {
  const out: string[] = [
    banner(version),
    '',
    `${theme.muted('Usage:')} cdwr <command> [flags]`,
    ''
  ];
  for (const group of groups) {
    const own = entries.filter(
      (e) => e.path[0] === group.name && e.path.length > 1
    );
    if (own.length === 0) continue;
    out.push(`${theme.title(group.name)}  ${theme.muted(group.summary)}`);
    out.push(
      column(
        own.map((e) => [
          theme.code(`${group.name} ${e.path.slice(1).join(' ')}`),
          e.summary
        ])
      )
    );
    out.push('');
  }
  const top = entries.filter((e) => e.path.length === 1);
  if (top.length) {
    out.push(theme.title('cdwr'));
    out.push(column(top.map((e) => [theme.code(e.path[0] ?? ''), e.summary])));
    out.push('');
  }
  out.push(
    theme.title('Global flags'),
    column(globalRows()),
    '',
    theme.muted(
      'cdwr <command> --help for its flags. Without a command, cdwr opens a menu.'
    )
  );
  return out.join('\n');
}
