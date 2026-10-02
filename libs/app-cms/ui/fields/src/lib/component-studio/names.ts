import type { CustomComponent } from '@codeware/shared/util/payload-types';

/** The collection's fields the studio reads and writes, by name */
export const sourceName = 'source' as const satisfies keyof CustomComponent;
export const inputsName =
  'propsSchema' as const satisfies keyof CustomComponent;
export const slugName = 'slug' as const satisfies keyof CustomComponent;
