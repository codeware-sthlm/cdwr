/**
 * Run work with stdout muted. Shared libs narrate through `console.log` or
 * `@actions/core`, which would corrupt `--json` output and talk over the
 * UI; commands print through the UI instead. Nested and overlapping calls
 * share one saved writer, so the last one out restores it.
 */
let depth = 0;
let saved: typeof process.stdout.write | undefined;

export async function muted<T>(work: () => Promise<T>): Promise<T> {
  if (depth++ === 0) {
    saved = process.stdout.write.bind(process.stdout);
    // Swallow the data but still honour a callback, which stream barriers rely on
    process.stdout.write = ((...args: unknown[]) => {
      const done = args.find((a) => typeof a === 'function') as
        | (() => void)
        | undefined;
      done?.();
      return true;
    }) as typeof process.stdout.write;
  }
  try {
    return await work();
  } finally {
    if (--depth === 0 && saved) {
      process.stdout.write = saved;
      saved = undefined;
    }
  }
}

/** The writer as it was before any muting, with every argument passed on */
export const unmutedWrite = (): typeof process.stdout.write =>
  saved ?? process.stdout.write.bind(process.stdout);
