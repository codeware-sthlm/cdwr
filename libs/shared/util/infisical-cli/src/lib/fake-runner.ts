import type { InfisicalRunner } from './infisical-runner';

/** A runner backed by canned output; records every call */
export const fakeRunner = (
  folders: Record<string, string[] | null>,
  secrets: Record<string, Record<string, string>>
): { run: InfisicalRunner; calls: string[][] } => {
  const calls: string[][] = [];
  const argOf = (args: string[], name: string) =>
    args.find((arg) => arg.startsWith(`--${name}=`))?.split('=')[1] ?? '';

  const run: InfisicalRunner = (args) => {
    calls.push(args);
    const path = argOf(args, 'path');
    if (args[0] === 'export') {
      return JSON.stringify(
        Object.entries(secrets[path] ?? {}).map(([key, value]) => ({
          key,
          value,
          secretPath: path
        }))
      );
    }
    const names = folders[path];
    if (names === null) return 'null';
    return JSON.stringify(
      (names ?? []).map((folderName) => ({
        folderId: 'id',
        folderName,
        folderPath: path
      }))
    );
  };
  return { run, calls };
};
