import { writeSync } from 'node:fs';

/**
 * Fails a script that ends without finishing.
 *
 * Importing the cms module graph under `tsx` sometimes leaves a module still
 * evaluating while nothing holds the event loop open. Node then exits cleanly,
 * with code 0 and no output at all — so `nx reset-db cms` reports success
 * while dropping nothing, and `nx seed cms` reports success while seeding
 * nothing. It is timing-dependent: the same script succeeds perhaps one run in
 * eight (COD-433).
 *
 * The race is not solved here. The silent success is, which is the part that
 * does damage — an accumulating database that looks perfectly healthy.
 *
 * Nothing has to be called. Every script here ends by calling `process.exit`,
 * which skips `beforeExit` entirely, so this fires only when the event loop
 * drained on its own — which is the failure and nothing else.
 *
 * **Import this first.** It has to be evaluated before whatever fails to, and
 * ESM evaluates imports in the order they are written. `import/order` leaves
 * side-effect imports where they are, so it stays first.
 *
 * `runScript` cannot do this job: it hangs off `main()`, and when module
 * evaluation never finishes, `main` never runs and neither of its handlers
 * fire. `beforeExit` fires regardless, because this module was reached.
 */
process.on('beforeExit', () => {
  // Written synchronously: `process.exit` drops whatever a pipe still buffers,
  // and a guard against silent failure that fails silently is worth nothing.
  // Same reason `run-migrations.ts` reports this way
  writeSync(
    2,
    [
      '',
      'Error: the script ended without completing.',
      '',
      '  Nothing was reported and nothing was done — see COD-433. It is',
      '  timing-dependent, so running it again will often work.',
      '',
      ''
    ].join('\n')
  );

  process.exit(1);
});
