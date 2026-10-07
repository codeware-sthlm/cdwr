export type ValueSource = 'vault' | 'environment';

/**
 * The precedence: committed .env < vault < everything set on purpose.
 *
 * Nx loads the committed .env into the task env before any executor runs, so
 * a vault key replaces an inherited value only when it is unset or still
 * equals the committed one. Anything else (.env.local, shell, parent target)
 * was set on purpose and wins, and so does every key in `explicit` (the
 * target's own env). Known edge: a shell value identical to the committed one
 * loses to the vault.
 *
 * Pure. Returns the vault-derived overlay to apply and each vault key's source.
 */
export const layerVault = (input: {
  inherited: Record<string, string | undefined>;
  committed: Record<string, string>;
  /** Keys set on purpose by the target; they always win */
  explicit: ReadonlySet<string>;
  vault: Record<string, string>;
}): { apply: Record<string, string>; sources: Record<string, ValueSource> } => {
  const apply: Record<string, string> = {};
  const sources: Record<string, ValueSource> = {};

  for (const [key, value] of Object.entries(input.vault)) {
    const inherited = input.inherited[key];
    if (
      !input.explicit.has(key) &&
      (inherited === undefined || inherited === input.committed[key])
    ) {
      apply[key] = value;
      sources[key] = 'vault';
    } else {
      sources[key] = 'environment';
    }
  }

  return { apply, sources };
};
