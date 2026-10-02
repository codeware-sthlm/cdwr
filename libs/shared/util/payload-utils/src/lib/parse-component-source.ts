import type { CustomComponent } from '@codeware/shared/util/payload-types';

/** Largest component source a build or check accepts, in characters */
export const MAX_COMPONENT_SOURCE_LENGTH = 200_000;

const PROP_NAME_PATTERN = /^[a-z][a-zA-Z0-9]*$/;

export type ComponentPropDeclaration = NonNullable<
  CustomComponent['propsSchema']
>[number];

/** The type each prop declaration may carry, keyed so a new one must be listed */
const propTypes = {
  text: true,
  textarea: true,
  number: true,
  checkbox: true
} as const satisfies Record<ComponentPropDeclaration['type'], true>;

const isPropType = (
  value: unknown
): value is ComponentPropDeclaration['type'] =>
  typeof value === 'string' && Object.hasOwn(propTypes, value);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Reads the declarations, or null when an entry is malformed. A row whose name
 * is not a prop name yet, such as one still being typed, is left out.
 */
const parsePropsSchema = (
  value: unknown
): ComponentPropDeclaration[] | null => {
  if (!Array.isArray(value)) {
    return null;
  }
  const declarations: ComponentPropDeclaration[] = [];
  for (const entry of value) {
    if (
      !isRecord(entry) ||
      typeof entry['name'] !== 'string' ||
      !isPropType(entry['type'])
    ) {
      return null;
    }
    if (!PROP_NAME_PATTERN.test(entry['name'])) {
      continue;
    }
    declarations.push({
      name: entry['name'],
      type: entry['type'],
      required: entry['required'] === true
    });
  }
  return declarations;
};

export type ComponentSourceBody = {
  source: string;
  propsSchema?: ComponentPropDeclaration[];
};

/**
 * Reads the `source` and optional `propsSchema` of a request body; a string
 * is the reason the body was refused.
 */
export const parseComponentSource = (
  body: unknown
): ComponentSourceBody | string => {
  if (!isRecord(body) || typeof body['source'] !== 'string') {
    return 'The body needs a `source` string.';
  }
  const { source, propsSchema } = body;
  if (source.length > MAX_COMPONENT_SOURCE_LENGTH) {
    return `The source is larger than ${MAX_COMPONENT_SOURCE_LENGTH} characters.`;
  }

  if (propsSchema === undefined) {
    return { source };
  }
  const declarations = parsePropsSchema(propsSchema);
  return declarations
    ? { source, propsSchema: declarations }
    : '`propsSchema` must list entries with a name and a valid type.';
};
