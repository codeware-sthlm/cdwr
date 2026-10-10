import type { ValueSource } from './layer-vault';

/**
 * One log line naming keys and layers, never values. Keys held by the
 * environment are vault key names, so they are safe to list.
 */
export const describeLayers = (input: {
  mode: 'online' | 'offline';
  environment: string;
  path: string;
  cacheName: string;
  sources: Record<string, ValueSource>;
}): string => {
  const keys = Object.keys(input.sources);
  const held = keys
    .filter((key) => input.sources[key] === 'environment')
    .sort();
  const fromVault = keys.length - held.length;

  const parts = [
    `${fromVault} from the ${input.mode === 'offline' ? 'cache' : 'vault'}`,
    ...(held.length ? [`${held.join(', ')} from the environment`] : [])
  ];

  const origin =
    input.mode === 'offline'
      ? `OFFLINE ${input.cacheName}`
      : `Infisical ${input.environment} ${input.path}`;

  return `[SECRETS] ${origin}: ${parts.join(', ')}`;
};
