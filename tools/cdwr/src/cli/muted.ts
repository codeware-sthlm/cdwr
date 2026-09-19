/**
 * Run work with stdout muted. Shared libs narrate through `console.log` or
 * `@actions/core`, which would corrupt `--json` output and talk over the
 * spinner; commands print through the UI instead.
 */
export async function muted<T>(work: () => Promise<T>): Promise<T> {
  const write = process.stdout.write.bind(process.stdout);
  process.stdout.write = (() => true) as typeof process.stdout.write;
  try {
    return await work();
  } finally {
    process.stdout.write = write;
  }
}
