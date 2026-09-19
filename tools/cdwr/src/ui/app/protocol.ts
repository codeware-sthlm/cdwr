import type { Choice } from '../../cli/inputs';

/**
 * Messages between the app (main thread) and the command worker. Commands
 * run in the worker so a blocking one never freezes the screen; the UI they
 * talk to is a remote that forwards every call here.
 */

export type PromptRequest = { id: number; message: string } & (
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

/** Worker → app */
export type FromWorker =
  | { type: 'intro'; title: string }
  | { type: 'line'; level: 'info' | 'success' | 'warn' | 'error'; text: string }
  | { type: 'note'; title?: string; lines: string[] }
  | { type: 'table'; head: string[]; rows: string[][] }
  | { type: 'raw'; text: string }
  | { type: 'task-start'; id: number; label: string }
  | { type: 'task-end'; id: number; state: 'done' | 'failed'; text?: string }
  | { type: 'prompt'; prompt: PromptRequest }
  /** The answer failed the input's validation; the prompt stays open */
  | { type: 'prompt-error'; id: number; error: string }
  | { type: 'prompt-done'; id: number }
  | { type: 'child'; pid: number }
  | { type: 'done'; code: number }
  | { type: 'crash'; message: string };

/** App → worker */
export type ToWorker =
  | { type: 'run'; path: string[]; argv: string[]; root: string }
  | { type: 'answer'; id: number; value: unknown }
  | { type: 'cancel'; id: number };
