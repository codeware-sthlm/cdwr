import type { CustomComponent } from '@codeware/shared/util/payload-types';

/** What the build compares the code against; labels and row ids do not count. */
export const schemaSignature = (
  schema: CustomComponent['propsSchema']
): string =>
  JSON.stringify(
    (schema ?? []).map(({ name, type, required }) => [
      name,
      type,
      required === true
    ])
  );
