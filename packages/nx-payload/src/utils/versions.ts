export const payloadVersion = '3.90.2';

/**
 * Next 16 version to install when missing.
 *
 * Payload v3.90 supports Next 16 (`>=16.3.3`), so the plugin installs Next 16
 * by default for new applications. Next 15 (`>=15.2.9`) still works with this
 * Payload version when a workspace already has it installed — the generator
 * never downgrades an existing Next.js version.
 *
 * @see https://github.com/nrwl/nx/blob/master/packages/next/src/utils/versions.ts
 */
export const next16Version = '^16.3.6';

export const graphqlVersion = '^16.10.0';
