import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { CMS_GUARD_MESSAGE } from '@codeware/shared/util/pure';

// Read as text: importing the guard would install its exit hooks in the test run
describe('exit guard', () => {
  it('prints the message cdwr and infisical-run retry on', () => {
    const guard = readFileSync(join(__dirname, 'exit-guard.ts'), 'utf8');
    expect(guard).toContain(CMS_GUARD_MESSAGE);
  });
});
