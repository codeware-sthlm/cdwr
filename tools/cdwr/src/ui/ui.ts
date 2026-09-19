import type { Choice } from '../cli/inputs';

export interface SelectOptions<T> {
  message: string;
  choices: ReadonlyArray<Choice<T>>;
  initial?: T;
}

export interface MultiselectOptions<T> extends Omit<
  SelectOptions<T>,
  'initial'
> {
  initial?: T[];
  min?: number;
}

export interface TextOptions {
  message: string;
  placeholder?: string;
  initial?: string;
  validate?: (value: string) => string | undefined;
}

export interface ConfirmOptions {
  message: string;
  initial?: boolean;
}

/** Prompts; every method throws `Cancelled` on ctrl-c */
export interface Prompter {
  select<T extends string>(opts: SelectOptions<T>): Promise<T>;
  multiselect<T extends string>(opts: MultiselectOptions<T>): Promise<T[]>;
  text(opts: TextOptions): Promise<string>;
  password(opts: TextOptions): Promise<string>;
  confirm(opts: ConfirmOptions): Promise<boolean>;
}

/** Everything a command may print; `--json` swaps in a silent one */
export interface Ui extends Prompter {
  readonly interactive: boolean;
  intro(title: string): void;
  outro(message: string): void;
  info(message: string): void;
  success(message: string): void;
  warn(message: string): void;
  error(message: string): void;
  /** A boxed block, for plans and things worth copying */
  note(body: string | string[], title?: string): void;
  /** Runs work behind a spinner; the label is replaced by the done text */
  task<T>(
    label: string,
    work: () => Promise<T>,
    done?: (result: T) => string
  ): Promise<T>;
  table(head: string[], rows: string[][]): void;
  /** Raw lines, used for diffs and listings */
  write(text: string): void;
}
