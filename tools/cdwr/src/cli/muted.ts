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
    process.stdout.write = (() => true) as typeof process.stdout.write;
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

/** The writer as it was before any muting, for output that must always land */
export const unmutedWrite = (): ((chunk: string) => boolean) => {
  const write = saved ?? process.stdout.write.bind(process.stdout);
  return (chunk) => write(chunk);
};
