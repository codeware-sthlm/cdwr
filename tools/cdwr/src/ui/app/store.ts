import { Cancelled } from '../../cli/errors';
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

/** What a prompt asks, without how it is answered */
export type PromptInput = { message: string } & (
  | { kind: 'select'; choices: ReadonlyArray<Choice<string>>; initial?: string }
  | {
      kind: 'multiselect';
      choices: ReadonlyArray<Choice<string>>;
      initial?: string[];
      min?: number;
    }
  | { kind: 'text' | 'password'; placeholder?: string; initial?: string }
  | { kind: 'confirm'; initial?: boolean }
);

/** A question the run is waiting on; a widget answers it, whoever asked validates */
export type Prompt = PromptInput & {
  id: number;
  /** Set when the last answer was refused; the prompt stays open */
  error?: string;
  resolve: (value: unknown) => void;
  reject: (error: unknown) => void;
};

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

/** How an open prompt reaches whoever asked it */
interface Answering {
  answer: (value: unknown) => void;
  cancel: () => void;
}

/**
 * The run pane's state, outside React so the runtime, or the bridge to a
 * worker, can write to it from anywhere. Components subscribe through
 * `useSyncExternalStore`.
 */
export class RunStore {
  private state: RunState | undefined;
  private listeners = new Set<Listener>();
  private nextId = 1;
  /** The value last submitted for the open prompt, shown once it is accepted */
  private submitted: unknown;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  snapshot = (): RunState | undefined => this.state;

  private notify(): void {
    for (const listener of this.listeners) listener();
  }

  private update(patch: (state: RunState) => RunState): void {
    // A failure before the intro still has to land somewhere visible
    if (!this.state) this.start('');
    this.state = patch(this.state as RunState);
    this.notify();
  }

  start(title: string): void {
    this.state = { title, startedAt: Date.now(), log: [], answered: [] };
    this.notify();
  }

  clear(): void {
    this.state = undefined;
    this.notify();
  }

  push(entry: LogEntry): void {
    this.update((s) => ({ ...s, log: [...s.log, entry] }));
  }

  /** Starts a task line and returns its id for `finish` */
  task(label: string): number {
    const id = this.nextId++;
    this.taskWithId(id, label);
    return id;
  }

  taskWithId(id: number, label: string): void {
    this.push({ kind: 'task', id, label, state: 'running' });
  }

  finish(id: number, state: 'done' | 'failed', text?: string): void {
    this.update((s) => ({
      ...s,
      log: s.log.map((e) =>
        e.kind === 'task' && e.id === id ? { ...e, state, text } : e
      )
    }));
  }

  /** Show a prompt; the widget's answer goes to `answering`, which decides */
  open(id: number, prompt: PromptInput, answering: Answering): void {
    this.update((s) => ({
      ...s,
      prompt: {
        ...prompt,
        id,
        resolve: (value) => {
          this.submitted = value;
          answering.answer(value);
        },
        reject: () => {
          this.update((state) => ({ ...state, prompt: undefined }));
          answering.cancel();
        }
      }
    }));
  }

  /** The answer was refused; say why and keep asking */
  promptError(id: number, error: string): void {
    this.update((s) =>
      s.prompt?.id === id ? { ...s, prompt: { ...s.prompt, error } } : s
    );
  }

  /** The answer was accepted; keep it above the form */
  close(id: number): void {
    this.update((s) => {
      if (s.prompt?.id !== id) return s;
      const shown = shownValue(s.prompt.kind, this.submitted);
      return {
        ...s,
        prompt: undefined,
        answered: [...s.answered, { message: s.prompt.message, shown }]
      };
    });
  }

  /** Ask and validate here, for a command running on this thread */
  ask<T>(
    prompt: PromptInput,
    validate?: (value: string) => string | undefined
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const id = this.nextId++;
      this.open(id, prompt, {
        answer: (value) => {
          const problem =
            typeof value === 'string' ? validate?.(value) : undefined;
          if (problem) {
            this.promptError(id, problem);
            return;
          }
          this.close(id);
          resolve(value as T);
        },
        cancel: () => reject(new Cancelled())
      });
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
