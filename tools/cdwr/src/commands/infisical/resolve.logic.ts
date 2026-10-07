import { layerVault } from '@codeware/shared/util/infisical-cli';

export type KeySource = 'vault' | 'vault over committed' | 'inherited';

export interface ResolvedKey {
  key: string;
  source: KeySource;
}

/**
 * Where each vault key would come from for a target in this shell, decided
 * by the same layering the `infisical-run` executor applies. A target's own
 * `env` is not known here.
 */
export const resolveKeys = (input: {
  inherited: Record<string, string | undefined>;
  committed: Record<string, string>;
  vault: Record<string, string>;
}): ResolvedKey[] => {
  const { sources } = layerVault({ ...input, explicit: new Set() });
  return Object.keys(sources)
    .sort()
    .map((key) => ({
      key,
      source:
        sources[key] === 'environment'
          ? 'inherited'
          : key in input.committed
            ? 'vault over committed'
            : 'vault'
    }));
};
