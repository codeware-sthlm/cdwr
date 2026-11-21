import { parseCommandArgs } from '../cli/args';
import type { InputSpec } from '../cli/inputs';
import { nameOf } from '../cli/registry';

import { ENTRIES } from './index';

describe.each(ENTRIES.map((entry) => [nameOf(entry), entry] as const))(
  '%s',
  (_name, entry) => {
    it('describes itself and every input, and gives every flag a short', async () => {
      const command = await entry.load();

      expect(command.description.trim()).not.toBe('');

      for (const [key, spec] of Object.entries(
        command.inputs as Record<string, InputSpec>
      )) {
        expect(spec.description.trim(), `${key} description`).not.toBe('');
        if (!spec.positional) {
          expect(spec.short, `${key} short`).toMatch(/^[a-zA-Z]$/);
        }
      }
    });

    it('has no flag or short that collides with another', async () => {
      const command = await entry.load();

      expect(() => parseCommandArgs([], command.inputs)).not.toThrow();
    });
  }
);
