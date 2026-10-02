import {
  DEFAULT_BUNDLED_PACKAGES,
  type HostModuleSpecifier
} from '@codeware/shared/util/payload-utils';

import type { ImportRequest } from './insert-import';

/** The hooks worth offering; the rest of `react` is a keystroke away */
export const REACT_HOOKS = [
  'useState',
  'useEffect',
  'useMemo',
  'useCallback',
  'useRef',
  'useId'
] as const;

type HostSource = Extract<HostModuleSpecifier, 'react' | '@site/ui'>;

export type ImportGroup =
  | { source: HostSource; entries: ImportRequest[] }
  | { source: 'bundled'; entries: ImportRequest[] };

/** Everything a component may import, grouped for the menu. */
export const importGroups = (kitNames: readonly string[]): ImportGroup[] => [
  {
    source: 'react',
    entries: REACT_HOOKS.map((name) => ({ module: 'react', name }))
  },
  {
    source: '@site/ui',
    entries: kitNames.map((name) => ({ module: '@site/ui', name }))
  },
  {
    source: 'bundled',
    entries: DEFAULT_BUNDLED_PACKAGES.map((module) => ({ module, name: null }))
  }
];

/** The text on a menu item */
export const importLabel = ({ module, name }: ImportRequest): string =>
  name ?? module;
