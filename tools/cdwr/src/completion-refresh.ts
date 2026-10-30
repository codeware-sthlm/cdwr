// Rewrites the installed completion script from the checkout `cdwr setup`
// linked from. The shim starts it detached, after a command, when that
// checkout's tree no longer matches the recorded one. Not a command, so it
// stays out of help and completion. Any failure leaves the old script and
// record in place, and the next run tries again.
import { existsSync, realpathSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { cdwrHome } from './cli/prefs';
import { findRoot } from './cli/workspace';
import { installCompletion, readRecord } from './commands/completion.install';
import { refreshMarker } from './commands/completion.logic';

const home = cdwrHome();
const record = readRecord(home);
// This file's own checkout: only the recorded one may write, any other could be behind
const root = realpathSync(findRoot(dirname(fileURLToPath(import.meta.url))));

if (record && existsSync(record.root) && realpathSync(record.root) === root) {
  installCompletion({
    shell: record.shell,
    file: record.file,
    root,
    cdwrHome: home
  })
    // Left behind on failure: the shim waits before trying again, and doctor reports it
    .then(() => rmSync(refreshMarker(home), { force: true }))
    .catch(() => undefined);
}
