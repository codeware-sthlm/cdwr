import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { PlatformDefinitionSchema } from '../platform-definition.schema';

import { platform } from './platform';

/**
 * The data this is checked against lives one directory away, in
 * `bundled/stock-media` — resolved here rather than through
 * `bundledStockMediaPath`, which is behind the server-only entry point this
 * spec has no reason to import.
 */
const stockMediaDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../bundled/stock-media'
);

describe('the platform definition', () => {
  it('is a valid platform definition', () => {
    const result = PlatformDefinitionSchema.safeParse(platform);

    if (!result.success) {
      throw new Error(
        result.error.issues
          .map(
            ({ path: issuePath, message }) =>
              `${issuePath.join('.')}: ${message}`
          )
          .join('\n')
      );
    }

    expect(result.success).toBe(true);
  });

  it('ships every stock media file it states', () => {
    for (const { filename } of platform.stockMedia) {
      expect(existsSync(path.join(stockMediaDir, filename))).toBe(true);
    }
  });

  it('seeds the four tenants the e2e suite and the platform agree on', () => {
    const slugs = platform.tenants.map(({ slug }) => slug);

    expect(slugs).toEqual(['cdwr-io', 'codeware', 'moon', 'star']);
  });
});
