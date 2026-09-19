import { Box, Text, useApp, useInput, useStdout } from 'ink';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore
} from 'react';

import { Cancelled } from '../../cli/errors';
import { type Entry, type Group, nameOf } from '../../cli/registry';
import { CLOUD } from '../logo';

import { colors, dangerColor, dangerLabel } from './palette';
import type { LogEntry, RunState, RunStore } from './store';
import {
  Card,
  Confirm,
  MultiSelect,
  Select,
  Spinner,
  Table,
  TextInput,
  isEnter
} from './widgets';

export interface AppProps {
  version: string;
  groups: Group[];
  entries: Entry[];
  store: RunStore;
  /** Runs a command through the runtime with the app UI; resolves to its exit code */
  run: (entry: Entry, argv: string[]) => Promise<number>;
  /** Open straight on a command, as `cdwr db backup` does */
  initial?: { entry: Entry; argv: string[] };
  onExit: (code: number) => void;
}

type Row =
  | { kind: 'header'; label: string }
  | { kind: 'command'; entry: Entry; label: string };

const SIDEBAR = 30;

const useSize = () => {
  const { stdout } = useStdout();
  const [size, setSize] = useState({
    columns: stdout.columns || 100,
    rows: stdout.rows || 30
  });
  useEffect(() => {
    const update = () =>
      setSize({ columns: stdout.columns || 100, rows: stdout.rows || 30 });
    stdout.on('resize', update);
    return () => {
      stdout.off('resize', update);
    };
  }, [stdout]);
  return size;
};

const buildRows = (
  groups: Group[],
  entries: Entry[],
  filter: string
): Row[] => {
  const q = filter.toLowerCase();
  const matches = (e: Entry) =>
    !q || nameOf(e).includes(q) || e.summary.toLowerCase().includes(q);
  const rows: Row[] = [];
  for (const group of groups) {
    const own = entries.filter(
      (e) => e.path[0] === group.name && e.path.length > 1 && matches(e)
    );
    if (!own.length) continue;
    rows.push({ kind: 'header', label: group.name });
    for (const entry of own)
      rows.push({
        kind: 'command',
        entry,
        label: entry.path.slice(1).join(' ')
      });
  }
  const top = entries.filter((e) => e.path.length === 1 && matches(e));
  if (top.length) {
    rows.push({ kind: 'header', label: 'cdwr' });
    for (const entry of top)
      rows.push({ kind: 'command', entry, label: entry.path[0] ?? '' });
  }
  return rows;
};

export function App({
  version,
  groups,
  entries,
  store,
  run,
  initial,
  onExit
}: AppProps) {
  const { exit } = useApp();
  const { columns, rows: height } = useSize();
  const runState = useSyncExternalStore(store.subscribe, store.snapshot);
  const [screen, setScreen] = useState<'home' | 'run'>(
    initial ? 'run' : 'home'
  );
  const [filter, setFilter] = useState('');
  const [filtering, setFiltering] = useState(false);
  const [help, setHelp] = useState(false);
  const [cursor, setCursor] = useState(0);
  const [lastCode, setLastCode] = useState(0);
  const [current, setCurrent] = useState<Entry | undefined>(initial?.entry);

  const rows = useMemo(
    () => buildRows(groups, entries, filter),
    [groups, entries, filter]
  );
  const commandIndexes = useMemo(
    () => rows.flatMap((r, i) => (r.kind === 'command' ? [i] : [])),
    [rows]
  );
  const selectedRow = rows[cursor];
  const selected =
    selectedRow?.kind === 'command' ? selectedRow.entry : undefined;

  useEffect(() => {
    if (selectedRow?.kind !== 'command') setCursor(commandIndexes[0] ?? 0);
  }, [rows, selectedRow, commandIndexes]);

  const leave = useCallback(
    (code: number) => {
      onExit(code);
      exit();
    },
    [onExit, exit]
  );

  const start = useCallback(
    (entry: Entry, argv: string[]) => {
      setCurrent(entry);
      setScreen('run');
      run(entry, argv).then(
        (code) => {
          setLastCode(code);
          store.end(code, '');
        },
        (error: unknown) => {
          setLastCode(1);
          store.end(1, error instanceof Error ? error.message : String(error));
        }
      );
    },
    [run, store]
  );

  useEffect(() => {
    if (initial) start(initial.entry, initial.argv);
    // Only on mount: the initial command opens once
  }, []);

  const move = (delta: number) => {
    if (!commandIndexes.length) return;
    const at = commandIndexes.indexOf(cursor);
    const next = (at + delta + commandIndexes.length) % commandIndexes.length;
    setCursor(commandIndexes[next] ?? 0);
  };

  // Home keys
  useInput(
    (input, key) => {
      if (key.ctrl && input === 'c') return leave(130);
      if (filtering) {
        if (key.escape) {
          setFilter('');
          setFiltering(false);
        } else if (isEnter(input, key)) setFiltering(false);
        else if (key.backspace || key.delete) setFilter((f) => f.slice(0, -1));
        else if (key.upArrow) move(-1);
        else if (key.downArrow) move(1);
        else if (input && !key.ctrl) setFilter((f) => f + input);
        return;
      }
      if (key.upArrow || input === 'k') move(-1);
      else if (key.downArrow || input === 'j') move(1);
      else if (input === '/') setFiltering(true);
      else if (input === '?') setHelp((h) => !h);
      else if (key.escape && filter) setFilter('');
      else if (input === 'q' || (key.escape && !filter)) leave(lastCode);
      else if (isEnter(input, key) && selected) start(selected, []);
      else if (input === 'd' && selected) start(selected, ['--dry-run']);
    },
    { isActive: screen === 'home' }
  );

  // Run keys: only once the command has ended, or ctrl-c any time
  useInput(
    (input, key) => {
      if (key.ctrl && input === 'c') {
        runState?.prompt?.reject(new Cancelled());
        return leave(130);
      }
      if (!runState?.result) return;
      if (isEnter(input, key) || key.escape || input === 'h' || key.leftArrow) {
        if (initial && current === initial.entry && !filter)
          return leave(lastCode);
        store.clear();
        setScreen('home');
      } else if (input === 'q') leave(lastCode);
    },
    { isActive: screen === 'run' && !runState?.prompt }
  );

  const bodyHeight = Math.max(5, height - 4);
  const breadcrumb =
    screen === 'run' && current
      ? nameOf(current)
      : selected
        ? nameOf(selected)
        : '';

  return (
    <Box flexDirection="column" width={columns} height={height}>
      <Header version={version} breadcrumb={breadcrumb} />
      <Box flexGrow={1} flexDirection="row" height={bodyHeight}>
        <Sidebar
          rows={rows}
          cursor={cursor}
          height={bodyHeight}
          filter={filter}
          filtering={filtering}
          dim={screen === 'run'}
        />
        <Box flexGrow={1} flexDirection="column" paddingX={1} overflow="hidden">
          {screen === 'run' && runState ? (
            <RunPane
              state={runState}
              height={bodyHeight}
              width={columns - SIDEBAR - 3}
            />
          ) : help ? (
            <KeyHelp />
          ) : selected ? (
            <CommandCard
              entry={selected}
              width={columns - SIDEBAR - 3}
              showCloud={bodyHeight >= 24}
            />
          ) : (
            <Text dimColor>Nothing matches "{filter}"</Text>
          )}
        </Box>
      </Box>
      <Footer
        screen={screen}
        filtering={filtering}
        ended={Boolean(runState?.result)}
        prompting={Boolean(runState?.prompt)}
      />
    </Box>
  );
}

function Header({
  version,
  breadcrumb
}: {
  version: string;
  breadcrumb: string;
}) {
  return (
    <Box
      paddingX={1}
      borderStyle="single"
      borderColor={colors.border}
      borderTop={false}
      borderLeft={false}
      borderRight={false}
    >
      <Text color={colors.brand} bold>
        ☁ cdwr
      </Text>
      <Text dimColor> {version}</Text>
      {breadcrumb ? (
        <Text>
          <Text dimColor> › </Text>
          {breadcrumb.split(' ').join('  ›  ')}
        </Text>
      ) : null}
    </Box>
  );
}

function Sidebar({
  rows,
  cursor,
  height,
  filter,
  filtering,
  dim
}: {
  rows: Row[];
  cursor: number;
  height: number;
  filter: string;
  filtering: boolean;
  dim: boolean;
}) {
  const visible = Math.max(1, height - 2);
  const offset = Math.max(
    0,
    Math.min(cursor - Math.floor(visible / 2), rows.length - visible)
  );
  const window = rows.slice(offset, offset + visible);
  return (
    <Box
      flexDirection="column"
      width={SIDEBAR}
      borderStyle="single"
      borderColor={colors.border}
      borderTop={false}
      borderLeft={false}
      borderBottom={false}
      paddingX={1}
    >
      <Text color={filtering ? colors.brand : undefined}>
        {filtering || filter ? `/ ${filter}${filtering ? '▏' : ''}` : ' '}
      </Text>
      {window.map((row, i) => {
        const index = offset + i;
        if (row.kind === 'header') {
          return (
            <Text key={`h-${row.label}`} color={colors.muted} bold>
              {row.label}
            </Text>
          );
        }
        const active = index === cursor;
        return (
          <Text
            key={nameOf(row.entry)}
            color={active ? colors.brand : undefined}
            dimColor={dim && !active}
            inverse={active && !dim}
          >
            {active ? '❯ ' : '  '}
            {row.label.padEnd(SIDEBAR - 8)}
            <Text color={dangerColor(row.entry.danger)}>
              {badge(row.entry)}
            </Text>
          </Text>
        );
      })}
    </Box>
  );
}

const badge = (entry: Entry): string => {
  switch (entry.danger) {
    case 'read':
      return ' ';
    case 'mutate':
      return '~';
    case 'destructive':
      return '!';
    case 'spends-money':
      return '$';
  }
};

function CommandCard({
  entry,
  width,
  showCloud
}: {
  entry: Entry;
  width: number;
  showCloud: boolean;
}) {
  const [details, setDetails] = useState<{
    description?: string;
    needs?: string[];
    inputs: string[];
    confirm: string;
  }>();
  useEffect(() => {
    let live = true;
    entry.load().then((command) => {
      if (!live) return;
      setDetails({
        description: command.description,
        needs: command.needs,
        inputs: Object.entries(
          command.inputs as Record<
            string,
            { prompt: string; flag?: string; optional?: boolean }
          >
        ).map(
          ([key, spec]) =>
            `--${spec.flag ?? key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}  ${spec.prompt}${spec.optional ? ' (optional)' : ''}`
        ),
        confirm: dangerLabel(command.danger)
      });
    });
    return () => {
      live = false;
    };
  }, [entry]);
  return (
    <Box flexDirection="column" width={width}>
      {showCloud ? (
        <Box flexDirection="column" marginBottom={1}>
          {CLOUD.map((line, i) => (
            <Text key={i} color={colors.brand}>
              {line}
            </Text>
          ))}
        </Box>
      ) : null}
      <Text bold>{nameOf(entry)}</Text>
      <Text>{entry.summary}</Text>
      <Text color={dangerColor(entry.danger)}>{dangerLabel(entry.danger)}</Text>
      {details?.description ? (
        <Box marginTop={1}>
          <Text wrap="wrap">{details.description}</Text>
        </Box>
      ) : null}
      {details?.needs?.length ? (
        <Text dimColor>needs {details.needs.join(', ')}</Text>
      ) : null}
      {details?.inputs.length ? (
        <Box flexDirection="column" marginTop={1}>
          <Text bold>Inputs</Text>
          {details.inputs.map((line) => (
            <Text key={line} dimColor>
              {line}
            </Text>
          ))}
        </Box>
      ) : null}
      <Box marginTop={1}>
        <Text dimColor>⏎ run d dry run</Text>
      </Box>
    </Box>
  );
}

function KeyHelp() {
  const keys: Array<[string, string]> = [
    ['↑ ↓  j k', 'move'],
    ['⏎', 'run the command'],
    ['d', 'dry run: show the plan, apply nothing'],
    ['/', 'filter commands; esc clears'],
    ['esc  h  ←', 'back to the menu after a command'],
    ['q', 'quit'],
    ['?', 'this help']
  ];
  return (
    <Box flexDirection="column">
      <Text bold>Keys</Text>
      {keys.map(([k, what]) => (
        <Text key={k}>
          <Text color={colors.brand}>{k.padEnd(12)}</Text>
          {what}
        </Text>
      ))}
      <Box marginTop={1}>
        <Text dimColor>
          Badges: ~ changes things ! destructive $ spends money
        </Text>
      </Box>
    </Box>
  );
}

const linesOf = (entry: LogEntry): number => {
  switch (entry.kind) {
    case 'note':
      return entry.lines.length + 2;
    case 'table':
      return entry.rows.length + 1;
    case 'raw':
      return entry.text.split('\n').length;
    default:
      return 1;
  }
};

/** Re-render every second while a command runs, so the clock and spinner move */
const useTicking = (running: boolean) => {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(timer);
  }, [running]);
};

function RunPane({
  state,
  height,
  width
}: {
  state: RunState;
  height: number;
  width: number;
}) {
  const fixed =
    2 + state.answered.length + (state.prompt ? 8 : 0) + (state.result ? 4 : 0);
  let budget = Math.max(3, height - fixed);
  const shown: LogEntry[] = [];
  for (let i = state.log.length - 1; i >= 0 && budget > 0; i--) {
    const entry = state.log[i];
    if (!entry) continue;
    budget -= linesOf(entry);
    shown.unshift(entry);
  }
  const running = !state.result && !state.prompt;
  useTicking(running);
  const took = ((Date.now() - state.startedAt) / 1000).toFixed(running ? 0 : 1);
  return (
    <Box flexDirection="column" width={width}>
      <Text bold>
        {state.title}
        {running ? (
          <Text color={colors.brand}>
            {'  '}
            <Spinner /> working {took}s
          </Text>
        ) : null}
      </Text>
      {state.answered.map((a, i) => (
        <Text key={i} dimColor>
          {a.message} <Text color={colors.accent}>{a.shown}</Text>
        </Text>
      ))}
      {shown.map((entry, i) => (
        <LogLine key={i} entry={entry} />
      ))}
      {state.prompt ? (
        <Box marginTop={1}>
          <PromptView prompt={state.prompt} />
        </Box>
      ) : null}
      {state.result ? (
        <Box marginTop={1}>
          <Card
            title={
              state.result.code === 0
                ? 'Done'
                : state.result.code === 130
                  ? 'Cancelled'
                  : 'Failed'
            }
            color={
              state.result.code === 0
                ? colors.ok
                : state.result.code === 130
                  ? colors.muted
                  : colors.danger
            }
          >
            {state.result.text ? <Text>{state.result.text}</Text> : null}
            <Text dimColor>{took}s ⏎ menu · q quit</Text>
          </Card>
        </Box>
      ) : null}
    </Box>
  );
}

function LogLine({ entry }: { entry: LogEntry }) {
  switch (entry.kind) {
    case 'task':
      return (
        <Text>
          {entry.state === 'running' ? (
            <Spinner />
          ) : entry.state === 'done' ? (
            <Text color={colors.ok}>✔</Text>
          ) : (
            <Text color={colors.danger}>✖</Text>
          )}{' '}
          {entry.state === 'running'
            ? entry.label
            : (entry.text ?? entry.label)}
        </Text>
      );
    case 'line': {
      const color =
        entry.level === 'success'
          ? colors.ok
          : entry.level === 'warn'
            ? colors.warn
            : entry.level === 'error'
              ? colors.danger
              : undefined;
      return <Text color={color}>{entry.text}</Text>;
    }
    case 'note':
      return (
        <Card title={entry.title}>
          {entry.lines.map((line, i) => (
            <Text key={i}>{line}</Text>
          ))}
        </Card>
      );
    case 'table':
      return <Table head={entry.head} rows={entry.rows} />;
    case 'raw':
      return <Text>{entry.text}</Text>;
  }
}

function PromptView({ prompt }: { prompt: RunState['prompt'] & object }) {
  const cancel = () => prompt.reject(new Cancelled());
  switch (prompt.kind) {
    case 'select':
      return (
        <Select
          message={prompt.message}
          choices={prompt.choices}
          initial={prompt.initial}
          onSubmit={prompt.resolve}
          onCancel={cancel}
        />
      );
    case 'multiselect':
      return (
        <MultiSelect
          message={prompt.message}
          choices={prompt.choices}
          initial={prompt.initial}
          min={prompt.min}
          onSubmit={prompt.resolve}
          onCancel={cancel}
        />
      );
    case 'confirm':
      return (
        <Confirm
          message={prompt.message}
          initial={prompt.initial}
          onSubmit={prompt.resolve}
          onCancel={cancel}
        />
      );
    case 'password':
      return (
        <TextInput
          message={prompt.message}
          mask
          validate={prompt.validate}
          onSubmit={prompt.resolve}
          onCancel={cancel}
        />
      );
    default:
      return (
        <TextInput
          message={prompt.message}
          placeholder={prompt.placeholder}
          initial={prompt.initial}
          validate={prompt.validate}
          onSubmit={prompt.resolve}
          onCancel={cancel}
        />
      );
  }
}

function Footer({
  screen,
  filtering,
  ended,
  prompting
}: {
  screen: 'home' | 'run';
  filtering: boolean;
  ended: boolean;
  prompting: boolean;
}) {
  const keys =
    screen === 'home'
      ? filtering
        ? 'type to filter · ⏎ keep · esc clear'
        : '↑↓ move · ⏎ run · d dry run · / filter · ? keys · q quit'
      : ended
        ? '⏎ menu · q quit'
        : prompting
          ? '↑↓ move · ⏎ answer · esc cancel'
          : 'working… · ctrl-c aborts';
  return (
    <Box
      paddingX={1}
      borderStyle="single"
      borderColor={colors.border}
      borderBottom={false}
      borderLeft={false}
      borderRight={false}
    >
      <Text dimColor>{keys}</Text>
    </Box>
  );
}
