import type { ImportCatalog } from '@codeware/shared/ui/component-studio';
import { DEFAULT_BUNDLED_PACKAGES } from '@codeware/shared/util/payload-utils';

import { loadKitNames } from './kit-names';

/** What the studio offers to import; the kit's names load on demand */
export const importCatalog = {
  // The hooks worth offering; the rest of `react` is a keystroke away
  reactHooks: [
    'useState',
    'useEffect',
    'useMemo',
    'useCallback',
    'useRef',
    'useId'
  ],
  packages: DEFAULT_BUNDLED_PACKAGES,
  loadKitNames
} as const satisfies ImportCatalog;
