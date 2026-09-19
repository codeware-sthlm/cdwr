/**
 * Contract for migration-specific verify hooks.
 *
 * Place a companion file in the verify/ subdirectory:
 *   apps/cms/src/migrations/verify/{migrationName}.ts
 *
 * The file must export a `verify` function matching `VerifyFn`.
 * The `query` helper executes SQL against the test database and returns
 * each result row as a trimmed string.
 * Return the number of checks passed; throw to signal failure.
 */
export type QueryFn = (sql: string) => Promise<string[]>;
export type VerifyFn = (query: QueryFn) => Promise<number>;

export interface VerifyModule {
  verify: VerifyFn;
}
