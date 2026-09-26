import { writeSync } from 'node:fs';

import type { CmsReportKey } from '@codeware/shared/util/pure';

/**
 * Prints a `KEY=value` line for `cdwr` to read.
 *
 * Written synchronously, like the exit guard's message: every script here ends
 * with `process.exit`, which drops whatever a pipe still buffers, and a report
 * lost after the work was done reads to the caller as nothing having happened.
 */
export const report = (key: CmsReportKey, value: string): void => {
  writeSync(1, `${key}=${value}\n`);
};
