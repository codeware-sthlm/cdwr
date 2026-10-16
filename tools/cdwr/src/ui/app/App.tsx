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
import {
  type Row as LogRowData,
  type Viewport,
  flattenLog,
  viewport,
  wrapLines
} from './rows';
import type { Prompt, RunState, RunStore } from './store';
import {
  Card,
  Confirm,
  MultiSelect,
  Select,
  Spinner,
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
  /** Stop a running command and whatever it spawned */
  abort?: () => void;
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
  abort,
  onExit
}: AppProps) {
  const { exit } = useApp();
  const { columns, rows: height } = useSize();
  const runState = useSyncExternalStore(store.subscribe, store.snapshot);
  const [screen, setScreen] = useState<'home' | 'run'>('home');
  const [filter, setFilter] = useState('');
  const [filtering, setFiltering] = useState(false);
  const [help, setHelp] = useState(false);
  const [cursor, setCursor] = useState(0);
  const [lastCode, setLastCode] = useState(0);
  const [current, setCurrent] = useState<Entry | undefined>();
  // Run pane scroll: a row index, or null to follow the tail
  const [scroll, setScroll] = useState<number | null>(null);

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
      setScroll(null);
      run(entry, argv).then(
        (code) => {
          setLastCode(code);
          setScroll(null);
          store.end(code, '');
        },
        (error: unknown) => {
          setLastCode(1);
          setScroll(null);
          store.end(1, error instanceof Error ? error.message : String(error));
        }
      );
    },
    [run, store]
  );

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

  // Ctrl-c leaves from anywhere, prompts included
  useInput(
    (input, key) => {
      if (key.ctrl && input === 'c') {
        runState?.prompt?.reject(new Cancelled());
        abort?.();
        leave(130);
      }
    },
    { isActive: screen === 'run' }
  );

  const paneWidth = columns - SIDEBAR - 3;
  const bodyHeight = Math.max(5, height - 4);
  const logRows = useMemo(
    () => flattenLog(runState?.log ?? [], paneWidth),
    [runState?.log, paneWidth]
  );
  // The result's text is wrapped inside the card, so its rows are known
  const resultLines = useMemo(
    () =>
      runState?.result?.text
        ? wrapLines(runState.result.text, paneWidth - CARD_INSET)
        : [],
    [runState?.result?.text, paneWidth]
  );
  const fixed =
    1 +
    (runState?.answered.length ?? 0) +
    (runState?.prompt ? promptRows(runState.prompt) : 0) +
    (runState?.result ? RESULT_FRAME + resultLines.length : 0);
  const budget = Math.max(3, bodyHeight - fixed);
  // Scrolled to the bottom is the same as following
  const view = viewport(logRows, budget, scroll);
  const pinned = scroll !== null && view.start < view.max;

  // Run keys: scroll any time, leave once the command has ended
  useInput(
    (input, key) => {
      if (!key.ctrl) {
        const to = (at: number) => setScroll(at >= view.max ? null : at);
        if (key.upArrow || input === 'k')
          return to(Math.max(0, view.start - 1));
        if (key.downArrow || input === 'j') return to(view.start + 1);
        if (key.pageUp || input === 'u')
          return to(Math.max(0, view.start - budget));
        if (key.pageDown || input === 'd') return to(view.start + budget);
        if (input === 'g') return to(0);
        if (input === 'G') return setScroll(null);
      }
      if (!runState?.result) return;
      if (isEnter(input, key) || key.escape || input === 'h' || key.leftArrow) {
        store.clear();
        setScroll(null);
        setScreen('home');
      } else if (input === 'q') leave(lastCode);
    },
    { isActive: screen === 'run' && !runState?.prompt }
  );

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
              view={view}
              pinned={pinned}
              resultLines={resultLines}
              width={paneWidth}
            />
          ) : help ? (
            <KeyHelp />
          ) : selected ? (
            <CommandCard
              entry={selected}
              width={paneWidth}
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

const MENU_KEYS: Array<[string, string]> = [
  ['↑ ↓  j k', 'move'],
  ['⏎', 'run the command'],
  ['d', 'dry run: show the plan, apply nothing'],
  ['/', 'filter commands; esc clears'],
  ['q', 'quit'],
  ['?', 'this help']
];

const RUN_KEYS: Array<[string, string]> = [
  ['↑ ↓  j k', 'scroll the output one row'],
  ['u d  PgUp PgDn', 'scroll a page'],
  ['g  G', 'top · follow the end'],
  ['esc  h  ←  ⏎', 'back to the menu once the command has ended'],
  ['q', 'quit once the command has ended']
];

function KeyList({
  title,
  keys
}: {
  title: string;
  keys: Array<[string, string]>;
}) {
  return (
    <Box flexDirection="column">
      <Text bold>{title}</Text>
      {keys.map(([k, what]) => (
        <Text key={k}>
          <Text color={colors.brand}>{k.padEnd(16)}</Text>
          {what}
        </Text>
      ))}
    </Box>
  );
}

function KeyHelp() {
  return (
    <Box flexDirection="column">
      <KeyList title="Menu" keys={MENU_KEYS} />
      <Box marginTop={1}>
        <KeyList title="During a run" keys={RUN_KEYS} />
      </Box>
      <Box marginTop={1}>
        <Text dimColor>
          Badges: ~ changes things ! destructive $ spends money
        </Text>
      </Box>
    </Box>
  );
}

/** Re-render every second while a command runs, so the clock and spinner move */
const useTicking = (running: boolean) => {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(timer);
  }, [running]);
};

/** Border and horizontal padding of the result card */
const CARD_INSET = 4;

/** Margin, border, title and the closing line of the result card */
const RESULT_FRAME = 5;

/** Terminal rows an open prompt takes: margin, message and the widget's lines */
const promptRows = (prompt: Prompt): number => {
  switch (prompt.kind) {
    case 'select':
      return 2 + prompt.choices.length;
    case 'multiselect':
      return 3 + prompt.choices.length;
    case 'text':
    case 'password':
      return 3 + (prompt.error ? 1 : 0);
    case 'confirm':
      return 3;
  }
};

function RunPane({
  state,
  view,
  pinned,
  resultLines,
  width
}: {
  state: RunState;
  view: Viewport;
  pinned: boolean;
  resultLines: string[];
  width: number;
}) {
  // While scrolled, a row after the visible ones says what is hidden
  const shown: LogRowData[] = pinned
    ? [
        ...view.rows,
        { kind: 'text', text: `… ${view.below} more below · G end`, dim: true }
      ]
    : view.rows;
  const running = !state.result && !state.prompt;
  useTicking(running);
  const took = ((Date.now() - state.startedAt) / 1000).toFixed(running ? 0 : 1);
  return (
    <Box flexDirection="column" width={width}>
      <Text bold wrap="truncate-end">
        {state.title}
        {running ? (
          <Text color={colors.brand}>
            {'  '}
            <Spinner /> working {took}s
          </Text>
        ) : null}
      </Text>
      {state.answered.map((a, i) => (
        <Text key={i} dimColor wrap="truncate-end">
          {a.message} <Text color={colors.accent}>{a.shown}</Text>
        </Text>
      ))}
      {shown.map((row, i) => (
        <LogRow key={i} row={row} />
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
            {resultLines.map((line, i) => (
              <Text key={i} wrap="truncate-end">
                {line}
              </Text>
            ))}
            <Text dimColor wrap="truncate-end">
              {took}s ⏎ menu · q quit
            </Text>
          </Card>
        </Box>
      ) : null}
    </Box>
  );
}

function LogRow({ row }: { row: LogRowData }) {
  switch (row.kind) {
    case 'text':
      return (
        <Text
          wrap="truncate-end"
          color={row.color}
          dimColor={row.dim}
          bold={row.bold}
        >
          {row.text}
        </Text>
      );
    case 'spinner':
      return (
        <Text wrap="truncate-end">
          <Spinner /> {row.text}
        </Text>
      );
    case 'note':
      return (
        <Card title={row.title}>
          {row.lines.map((line, i) => (
            <Text key={i} wrap="truncate-end">
              {line}
            </Text>
          ))}
        </Card>
      );
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
          error={prompt.error}
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
          error={prompt.error}
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
        ? '↑↓ scroll · G end · ⏎ menu · q quit'
        : prompting
          ? '↑↓ move · ⏎ answer · esc cancel'
          : '↑↓ scroll · working… · ctrl-c aborts';
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
