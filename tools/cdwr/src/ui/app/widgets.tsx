import { Box, Text, useInput } from 'ink';
import { useEffect, useState } from 'react';

import type { Choice } from '../../cli/inputs';
import { plain } from '../theme';

import { colors } from './palette';

/** Enter arrives as `return`, or as a bare newline on some terminals */
export const isEnter = (input: string, key: { return: boolean }): boolean =>
  key.return || input === '\n' || input === '\r';

const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

export function Spinner() {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const timer = setInterval(
      () => setFrame((f) => (f + 1) % FRAMES.length),
      80
    );
    return () => clearInterval(timer);
  }, []);
  return <Text color={colors.brand}>{FRAMES[frame]}</Text>;
}

/** A bordered block with a title on the frame */
export function Card({
  title,
  color = colors.border,
  children
}: {
  title?: string;
  color?: string;
  children: React.ReactNode;
}) {
  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={color}
      paddingX={1}
    >
      {title ? (
        <Text color={color} bold>
          {title}
        </Text>
      ) : null}
      {children}
    </Box>
  );
}

const width = (cells: string[]) =>
  Math.max(...cells.map((c) => plain(c).length), 0);

/** Columns padded to their widest cell; ANSI in cells is kept */
export function Table({ head, rows }: { head: string[]; rows: string[][] }) {
  const widths = head.map((h, i) => width([h, ...rows.map((r) => r[i] ?? '')]));
  const pad = (cell: string, i: number) =>
    cell + ' '.repeat(Math.max(0, (widths[i] ?? 0) - plain(cell).length));
  return (
    <Box flexDirection="column">
      <Text bold>{head.map(pad).join('  ')}</Text>
      {rows.map((row, r) => (
        <Text key={r}>{row.map(pad).join('  ')}</Text>
      ))}
    </Box>
  );
}

interface SelectProps {
  message: string;
  choices: ReadonlyArray<Choice<string>>;
  initial?: string;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}

/** One of many; ↑↓ move, ⏎ picks, esc cancels */
export function Select({
  message,
  choices,
  initial,
  onSubmit,
  onCancel
}: SelectProps) {
  const start = Math.max(
    0,
    choices.findIndex((c) => c.value === initial)
  );
  const [cursor, setCursor] = useState(start);
  useInput((input, key) => {
    if (key.upArrow || input === 'k')
      setCursor((c) => (c - 1 + choices.length) % choices.length);
    else if (key.downArrow || input === 'j')
      setCursor((c) => (c + 1) % choices.length);
    else if (isEnter(input, key)) onSubmit(choices[cursor]?.value ?? '');
    else if (key.escape) onCancel();
  });
  return (
    <Box flexDirection="column">
      <Text bold>{message}</Text>
      {choices.map((choice, i) => (
        <Text
          key={choice.value}
          color={i === cursor ? colors.brand : undefined}
        >
          {i === cursor ? '❯ ' : '  '}
          {choice.label ?? choice.value}
          {choice.hint ? <Text dimColor> {choice.hint}</Text> : null}
        </Text>
      ))}
    </Box>
  );
}

interface MultiSelectProps extends Omit<SelectProps, 'initial' | 'onSubmit'> {
  initial?: string[];
  min?: number;
  onSubmit: (values: string[]) => void;
}

/** Several of many; space toggles, a toggles all, ⏎ submits */
export function MultiSelect({
  message,
  choices,
  initial,
  min = 0,
  onSubmit,
  onCancel
}: MultiSelectProps) {
  const [cursor, setCursor] = useState(0);
  const [picked, setPicked] = useState<Set<string>>(new Set(initial ?? []));
  const [error, setError] = useState<string>();
  useInput((input, key) => {
    if (key.upArrow || input === 'k')
      setCursor((c) => (c - 1 + choices.length) % choices.length);
    else if (key.downArrow || input === 'j')
      setCursor((c) => (c + 1) % choices.length);
    else if (input === ' ') {
      const value = choices[cursor]?.value;
      if (value === undefined) return;
      setPicked((p) => {
        const next = new Set(p);
        if (next.has(value)) next.delete(value);
        else next.add(value);
        return next;
      });
      setError(undefined);
    } else if (input === 'a') {
      setPicked((p) =>
        p.size === choices.length
          ? new Set()
          : new Set(choices.map((c) => c.value))
      );
    } else if (isEnter(input, key)) {
      if (picked.size < min) setError(`Pick at least ${min}`);
      else onSubmit(choices.map((c) => c.value).filter((v) => picked.has(v)));
    } else if (key.escape) onCancel();
  });
  return (
    <Box flexDirection="column">
      <Text bold>{message}</Text>
      {choices.map((choice, i) => (
        <Text
          key={choice.value}
          color={i === cursor ? colors.brand : undefined}
        >
          {i === cursor ? '❯ ' : '  '}
          <Text color={picked.has(choice.value) ? colors.ok : colors.muted}>
            {picked.has(choice.value) ? '◉' : '◯'}
          </Text>{' '}
          {choice.label ?? choice.value}
          {choice.hint ? <Text dimColor> {choice.hint}</Text> : null}
        </Text>
      ))}
      <Text dimColor>
        {error ? (
          <Text color={colors.danger}>{error}</Text>
        ) : (
          'space toggles · a all · ⏎ done'
        )}
      </Text>
    </Box>
  );
}

interface TextInputProps {
  message: string;
  placeholder?: string;
  initial?: string;
  mask?: boolean;
  /** Why the last answer was refused, from whoever asked */
  error?: string;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}

/** A line of text; ⏎ submits after validation, esc cancels */
export function TextInput({
  message,
  placeholder,
  initial = '',
  mask,
  error,
  onSubmit,
  onCancel
}: TextInputProps) {
  const [value, setValue] = useState(initial);
  const [cursor, setCursor] = useState(initial.length);
  const [touched, setTouched] = useState(false);
  // A fresh refusal shows until the next edit
  useEffect(() => setTouched(false), [error]);
  useInput((input, key) => {
    if (isEnter(input, key)) onSubmit(value);
    else if (key.escape) onCancel();
    else if (key.backspace || key.delete) {
      if (cursor === 0) return;
      setValue((v) => v.slice(0, cursor - 1) + v.slice(cursor));
      setCursor((c) => c - 1);
      setTouched(true);
    } else if (key.leftArrow) setCursor((c) => Math.max(0, c - 1));
    else if (key.rightArrow) setCursor((c) => Math.min(value.length, c + 1));
    else if (input && !key.ctrl && !key.meta) {
      setValue((v) => v.slice(0, cursor) + input + v.slice(cursor));
      setCursor((c) => c + input.length);
      setTouched(true);
    }
  });
  const shown = mask ? '•'.repeat(value.length) : value;
  const before = shown.slice(0, cursor);
  const at = shown[cursor] ?? ' ';
  const after = shown.slice(cursor + 1);
  return (
    <Box flexDirection="column">
      <Text bold>{message}</Text>
      <Text>
        <Text color={colors.brand}>❯ </Text>
        {value.length === 0 && placeholder ? (
          <Text dimColor>{placeholder}</Text>
        ) : (
          <>
            {before}
            <Text inverse>{at}</Text>
            {after}
          </>
        )}
      </Text>
      {error && !touched ? <Text color={colors.danger}>{error}</Text> : null}
    </Box>
  );
}

interface ConfirmProps {
  message: string;
  initial?: boolean;
  onSubmit: (value: boolean) => void;
  onCancel: () => void;
}

/** Yes or no; y/n answer at once, ←→ and ⏎ too */
export function Confirm({
  message,
  initial = false,
  onSubmit,
  onCancel
}: ConfirmProps) {
  const [yes, setYes] = useState(initial);
  useInput((input, key) => {
    if (input === 'y') onSubmit(true);
    else if (input === 'n') onSubmit(false);
    else if (key.leftArrow || key.rightArrow || input === 'h' || input === 'l')
      setYes((v) => !v);
    else if (isEnter(input, key)) onSubmit(yes);
    else if (key.escape) onCancel();
  });
  return (
    <Box flexDirection="column">
      <Text bold>{message}</Text>
      <Text>
        <Text color={yes ? colors.brand : undefined}>
          {yes ? '● yes' : '○ yes'}
        </Text>
        {'   '}
        <Text color={!yes ? colors.brand : undefined}>
          {!yes ? '● no' : '○ no'}
        </Text>
      </Text>
    </Box>
  );
}
