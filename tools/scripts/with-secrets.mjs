#!/usr/bin/env node
/**
 * Runs a command with the platform's secrets injected by Infisical.
 *
 * Online is the default and the quiet path. `infisical run` uses the session
 * you logged in with, so the repository holds no token at all — which is the
 * point: a machine credential on disk is the thing this replaces, not a smaller
 * version of it.
 *
 * `OFFLINE=1` is a deliberate opt-out, never an automatic fallback. If Infisical
 * fails while you believe you are online, that is worth hearing about
 * immediately. A silent fallback would hide an expired session behind stale
 * local values and send you debugging the wrong thing.
 *
 * Refresh the offline copy while you still have a session:
 *
 *   nx dx:secrets cms
 *
 * Usage: node tools/scripts/with-secrets.mjs [--path=/apps/cms] -- <command...>
 */
import { execFileSync, spawn } from 'node:child_process';
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const argv = process.argv.slice(2);
const separator = argv.indexOf('--');

/** Refreshing writes the cache and runs nothing, so it needs no command. */
const refreshing = argv.includes('--refresh-offline');

if (!refreshing && (separator === -1 || separator === argv.length - 1)) {
  console.error('with-secrets: expected a command after --');
  process.exit(2);
}

const flags = separator === -1 ? argv : argv.slice(0, separator);
const command = separator === -1 ? [] : argv.slice(separator + 1);

const flagValue = (name, fallback) =>
  flags.find((flag) => flag.startsWith(`--${name}=`))?.split('=')[1] ??
  fallback;

const path = flagValue('path', '/apps/cms');

/**
 * Values the target insists on, applied after Infisical.
 *
 * `infisical run` injects over whatever it inherits, so a target's own `env`
 * silently loses to the vault. That is wrong for anything the target is
 * asserting rather than configuring — `nx seed cms` means seed, whatever
 * `SEED_SOURCE` happens to say in Infisical.
 */
const overrides = flags
  .filter((flag) => flag.startsWith('--set='))
  .map((flag) => flag.slice('--set='.length))
  .map((pair) => {
    const at = pair.indexOf('=');
    return [pair.slice(0, at), pair.slice(at + 1)];
  })
  .filter(([key]) => key);
/**
 * Values the surrounding environment insists on, named by `WITH_SECRETS_PRESERVE`.
 *
 * E2E sets an isolated `DATABASE_URL`, and the vault holds one too — without
 * this the vault's would win and an E2E run would reseed the development database. The
 * target cannot use `--set` for these: it does not know the values, only that
 * whoever set them meant them.
 */
const preserved = (process.env['WITH_SECRETS_PRESERVE'] ?? '')
  .split(',')
  .map((key) => key.trim())
  .filter((key) => key && process.env[key] !== undefined)
  .map((key) => [key, process.env[key]]);

const environment = process.env['DEPLOY_ENV'] || 'development';

const isSet = (name) =>
  !['', 'false', '0'].includes((process.env[name] ?? '').toLowerCase());

/** Anything but an empty string or an explicit `false` means offline. */
const offline = isSet('OFFLINE');

/**
 * CI already has its environment from GitHub secrets and no session to use, so
 * Infisical is skipped there. That is not the silent fallback this script
 * refuses to have: `CI` is as deliberate a signal as `OFFLINE`, and a developer's
 * machine still fails loudly when the session is gone.
 */
const ci = isSet('CI');

/** Both kinds of assertion are applied the same way, after injection. */
const assertions = [...preserved, ...overrides];

const run = (file, args, applyOverrides = false) => {
  const child = spawn(file, args, {
    stdio: 'inherit',
    // npx and next are .cmd shims on Windows, which spawn cannot launch directly
    shell: process.platform === 'win32',
    env: applyOverrides
      ? { ...process.env, ...Object.fromEntries(assertions) }
      : process.env
  });

  child.on('error', (error) => {
    if (error.code === 'ENOENT' && file === 'infisical') {
      console.error(
        [
          '',
          'with-secrets: the Infisical CLI is not installed.',
          '  Install it, then `infisical login`.',
          '  Working offline on purpose? Re-run with OFFLINE=1.',
          ''
        ].join('\n')
      );
      process.exit(127);
    }
    console.error(`with-secrets: ${error.message}`);
    process.exit(1);
  });

  // Infisical exits with its own code when it cannot authenticate, and with the
  // command's code otherwise. Its message is the useful one, so it is passed
  // through rather than wrapped — only the way out is added
  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    if (code !== 0 && !offline && !ci) {
      console.error(
        `\nwith-secrets: if Infisical is the problem, \`infisical login\` — or OFFLINE=1 to use ${OFFLINE_NAME} on purpose.`
      );
    }
    process.exit(code ?? 1);
  });
};

/**
 * The offline copy of the vault.
 *
 * Generated, never hand-written, and kept apart from `.env` so that refreshing
 * it cannot overwrite the public configuration living there:
 *
 *   infisical export --env=development --path=/apps/cms \
 *     --format=dotenv --output-file=apps/cms/.env.offline
 */
// Resolved from the repository root: the targets run with `cwd: apps/cms`, so a
// path relative to the process would land in the wrong place
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** `/apps/web` and its sub-folders all cache to `apps/web/.env.offline`. */
const app = path.replace(/^\/apps\//, '').split('/')[0] || 'cms';
const OFFLINE_NAME = `apps/${app}/.env.offline`;
const OFFLINE_FILE = join(REPO_ROOT, OFFLINE_NAME);

const readOfflineFile = () => {
  if (!existsSync(OFFLINE_FILE)) {
    console.error(
      [
        '',
        `with-secrets: OFFLINE is set but ${OFFLINE_NAME} does not exist.`,
        '  Generate it while you still have a session:',
        `    infisical export --env=development --path=${path} \\`,
        `      --format=dotenv --output-file=${OFFLINE_NAME}`,
        ''
      ].join('\n')
    );
    process.exit(1);
  }

  const values = {};
  for (const line of readFileSync(OFFLINE_FILE, 'utf8').split('\n')) {
    const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line);
    if (!match) continue;
    // dotenv quoting, which `infisical export` applies to every value
    values[match[1]] = match[2].trim().replace(/^(['"])(.*)\1$/, '$2');
  }
  return values;
};

/**
 * Rewrites the offline cache from Infisical.
 *
 * Folders are discovered rather than listed by hand: `infisical export` cannot
 * recurse, and `/apps/cms` has sub-folders (`api-url`, `signature`) holding
 * required values. A hand-typed command misses them silently, which is the
 * failure worth engineering out — only folder *names* are parsed here, while
 * the values stay inside `infisical export`, which writes proper dotenv.
 */
const refreshOffline = () => {
  const infisical = (args) =>
    execFileSync('infisical', args, {
      encoding: 'utf8',
      // Only stdout is parsed; without this Infisical's error never reaches the terminal
      stdio: ['ignore', 'pipe', 'inherit']
    });

  const listing = infisical([
    'secrets',
    'folders',
    'get',
    `--path=${path}`,
    `--env=${environment}`
  ]);

  // Table rows read `│ name │ /apps/cms │ <uuid> │`
  const folders = [...listing.matchAll(/^│\s*([a-z0-9][a-z0-9-]*)\s*│/gim)]
    .map(([, name]) => name)
    .filter((name) => name !== 'folder');

  const paths = [path, ...folders.map((name) => `${path}/${name}`)];

  const body = paths
    .map((from) => {
      const dotenv = infisical([
        'export',
        `--env=${environment}`,
        `--path=${from}`,
        '--format=dotenv'
      ]);
      return `# --- ${from}\n${dotenv.trim()}`;
    })
    .join('\n\n');

  writeFileSync(
    OFFLINE_FILE,
    [
      '# Generated by `nx dx:secrets cms` — do not edit.',
      `# Infisical ${environment}, from ${paths.join(', ')}`,
      '',
      body,
      ''
    ].join('\n'),
    { mode: 0o600 }
  );
  // mode only applies when the file is created, so an existing cache needs this too
  chmodSync(OFFLINE_FILE, 0o600);

  const count = body
    .split('\n')
    .filter((line) => /^[A-Za-z_]/.test(line)).length;
  console.log(
    `[SECRETS] Wrote ${count} value(s) to ${OFFLINE_NAME} from ${paths.length} path(s)`
  );
};

if (flags.includes('--refresh-offline')) {
  refreshOffline();
  process.exit(0);
}

if (ci) {
  console.log('[SECRETS] CI — using the environment the workflow provides');
  run(command[0], command.slice(1), true);
} else if (offline) {
  const cached = readOfflineFile();

  console.log(
    `[SECRETS] OFFLINE — ${Object.keys(cached).length} value(s) from ${OFFLINE_NAME}`
  );

  // The cache stands in for Infisical, so the target's assertions still win
  Object.assign(process.env, cached);
  run(command[0], command.slice(1), true);
} else {
  // Only the target's own flags are named. Anything read from the environment
  // stays a count — naming it would mean logging a value CodeQL treats as secret
  const held = [
    ...overrides.map(([key]) => key),
    ...(preserved.length ? [`${preserved.length} preserved`] : [])
  ];
  console.log(
    `[SECRETS] Infisical ${environment} ${path}` +
      (held.length ? ` (${held.join(', ')} held over the vault)` : '')
  );
  // `env` applies them *after* Infisical has injected, which setting them on
  // this process cannot do — infisical run writes over what it inherits
  const applied = assertions.map(([key, value]) => `${key}=${value}`);

  run('infisical', [
    'run',
    `--env=${environment}`,
    `--path=${path}`,
    '--recursive',
    '--',
    ...(applied.length ? ['env', ...applied] : []),
    ...command
  ]);
}
