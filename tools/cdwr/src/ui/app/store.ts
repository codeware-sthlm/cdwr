import type { Choice } from '../../cli/inputs';

/** One line of what a command reported, as the run pane shows it */
export type LogEntry =
  | {
      kind: 'task';
      id: number;
      label: string;
      state: 'running' | 'done' | 'failed';
      text?: string;
    }
  | { kind: 'line'; level: 'info' | 'success' | 'warn' | 'error'; text: string }
  | { kind: 'note'; title?: string; lines: string[] }
  | { kind: 'table'; head: string[]; rows: string[][] }
  | { kind: 'raw'; text: string };

/** A question the runtime is waiting on; the form resolves it */
export type Prompt = {
  id: number;
  resolve: (value: unknown) => void;
  reject: (error: unknown) => void;
} & (
  | {
      kind: 'select';
      message: string;
      choices: ReadonlyArray<Choice<string>>;
      initial?: string;
    }
  | {
      kind: 'multiselect';
      message: string;
      choices: ReadonlyArray<Choice<string>>;
      initial?: string[];
      min?: number;
    }
  | {
      kind: 'text' | 'password';
      message: string;
      placeholder?: string;
      initial?: string;
      validate?: (value: string) => string | undefined;
    }
  | { kind: 'confirm'; message: string; initial?: boolean }
);

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown
  ? Omit<T, K>
  : never;

/** A prompt as the UI adapter asks it, before the store wires resolution */
export type PromptInput = DistributiveOmit<Prompt, 'id' | 'resolve' | 'reject'>;

/** An answered prompt, kept above the form */
export interface Answered {
  message: string;
  shown: string;
}

export interface RunState {
  /** `cdwr db backup` */
  title: string;
  startedAt: number;
  log: LogEntry[];
  answered: Answered[];
  prompt?: Prompt;
  /** Set when the command has ended, whatever the outcome */
  result?: { code: number; text: string };
}

type Listener = () => void;

/**
 * The run pane's state, outside React so the runtime can write to it from
 * anywhere. Components subscribe through `useSyncExternalStore`.
 */
export class RunStore {
  private state: RunState | undefined;
  private listeners = new Set<Listener>();
  private nextId = 1;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  snapshot = (): RunState | undefined => this.state;

  private update(patch: (state: RunState) => RunState): void {
    // A failure before the intro still has to land somewhere visible
    if (!this.state) this.start('');
    this.state = patch(this.state as RunState);
    for (const listener of this.listeners) listener();
  }

  start(title: string): void {
    this.state = {
      title,
      startedAt: Date.now(),
      log: [],
      answered: []
    };
    for (const listener of this.listeners) listener();
  }

  clear(): void {
    this.state = undefined;
    for (const listener of this.listeners) listener();
  }

  push(entry: LogEntry): void {
    this.update((s) => ({ ...s, log: [...s.log, entry] }));
  }

  /** Starts a task line and returns its id for `finish` */
  task(label: string): number {
    const id = this.nextId++;
    this.push({ kind: 'task', id, label, state: 'running' });
    return id;
  }

  finish(id: number, state: 'done' | 'failed', text?: string): void {
    this.update((s) => ({
      ...s,
      log: s.log.map((e) =>
        e.kind === 'task' && e.id === id ? { ...e, state, text } : e
      )
    }));
  }

  /** Blocks on the form until it resolves or rejects */
  ask<T>(prompt: PromptInput): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const id = this.nextId++;
      const done = (shown: string) =>
        this.update((s) => ({
          ...s,
          prompt: undefined,
          answered: [...s.answered, { message: prompt.message, shown }]
        }));
      this.update((s) => ({
        ...s,
        prompt: {
          ...prompt,
          id,
          resolve: (value) => {
            done(shownValue(prompt.kind, value));
            resolve(value as T);
          },
          reject: (error) => {
            this.update((state) => ({ ...state, prompt: undefined }));
            reject(error);
          }
        } as Prompt
      }));
    });
  }

  end(code: number, text: string): void {
    this.update((s) => ({ ...s, result: { code, text } }));
  }
}

const shownValue = (kind: Prompt['kind'], value: unknown): string => {
  switch (kind) {
    case 'password':
      return '••••••';
    case 'confirm':
      return value ? 'yes' : 'no';
    case 'multiselect':
      return (value as string[]).join(', ') || 'none';
    default:
      return String(value);
  }
};
