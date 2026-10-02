import type { CustomComponent } from '@codeware/shared/util/payload-types';

export type PropDeclaration = NonNullable<
  CustomComponent['propsSchema']
>[number];

export type PropType = PropDeclaration['type'];

/** The values an editor has filled in, by prop name */
export type PropValues = Record<string, unknown>;

/** What a prop is stored as; absent when the editor left it empty */
export type PropValue = string | number | boolean;

/** The collection the block's `component` relationship points at */
export const customComponentsSlug = 'custom-components';

/** The component fields the form needs, read with `select` */
export const componentSelectFields = ['name', 'propsSchema'] as const;

export type ComponentSchema = {
  name: string;
  declarations: PropDeclaration[];
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const propTypeGuards = {
  text: true,
  textarea: true,
  number: true,
  checkbox: true
} as const satisfies Record<PropType, true>;

const isPropType = (value: unknown): value is PropType =>
  typeof value === 'string' && Object.hasOwn(propTypeGuards, value);

/** Reads one declaration from untyped JSON; null when it is unusable */
export const parseDeclaration = (value: unknown): PropDeclaration | null => {
  if (!isRecord(value)) {
    return null;
  }
  const { name, label, type, required } = value;
  if (typeof name !== 'string' || name === '' || !isPropType(type)) {
    return null;
  }
  return {
    name,
    type,
    label: typeof label === 'string' && label !== '' ? label : null,
    required: required === true
  };
};

/**
 * Reads a custom component's name and declared props from a REST answer.
 * Null when the answer is not a component; unusable declarations are dropped.
 */
export const parseComponentSchema = (body: unknown): ComponentSchema | null => {
  if (!isRecord(body) || typeof body['name'] !== 'string') {
    return null;
  }
  const raw = body['propsSchema'];
  const declarations = Array.isArray(raw)
    ? raw.flatMap((item) => parseDeclaration(item) ?? [])
    : [];
  return { name: body['name'], declarations };
};

/** The id a relationship value holds, whether populated or not */
export const relationId = (value: unknown): number | string | null => {
  if (typeof value === 'number' || (typeof value === 'string' && value)) {
    return value;
  }
  if (isRecord(value)) {
    return relationId(value['id'] ?? value['value']);
  }
  return null;
};

/** The id the row's relationship field holds; null when it is empty */
export const siblingRelationId = (
  siblingData: unknown,
  name: string
): number | string | null =>
  isRecord(siblingData) ? relationId(siblingData[name]) : null;

/**
 * The path of a field next to another one in the same row, derived from the
 * other field's own path: `layout.2.props` -> `layout.2.component`.
 */
export const siblingPath = (path: string, name: string): string => {
  const cut = path.lastIndexOf('.');
  return cut === -1 ? name : `${path.slice(0, cut)}.${name}`;
};

/** A stored `props` value is either empty or a plain object */
export const isPropsObject = (value: unknown): boolean =>
  value === null || value === undefined || isRecord(value);

/** The stored values as an object; anything else counts as nothing stored */
export const readValues = (stored: unknown): PropValues =>
  isRecord(stored) ? stored : {};

/** What an input receives: the stored value as text, or empty */
export const displayText = (stored: unknown): string =>
  typeof stored === 'string' || typeof stored === 'number'
    ? String(stored)
    : '';

const coercers = {
  text: (raw) => (typeof raw === 'string' && raw !== '' ? raw : undefined),
  textarea: (raw) => (typeof raw === 'string' && raw !== '' ? raw : undefined),
  number: (raw) => {
    if (typeof raw !== 'string' || raw.trim() === '') {
      return undefined;
    }
    const number = Number(raw);
    return Number.isFinite(number) ? number : undefined;
  },
  checkbox: (raw) => (typeof raw === 'boolean' ? raw : undefined)
} as const satisfies Record<
  PropType,
  (raw: string | boolean) => PropValue | undefined
>;

/** Turns what an input holds into what is stored; undefined means omit */
export const coerceInput = (
  type: PropType,
  raw: string | boolean
): PropValue | undefined => coercers[type](raw);

/**
 * The stored object with one value set, or removed when it is undefined.
 * Every other key is kept as it is.
 */
export const withValue = (
  stored: unknown,
  name: string,
  value: PropValue | undefined
): PropValues | null => {
  const rest = Object.fromEntries(
    Object.entries(readValues(stored)).filter(([key]) => key !== name)
  );
  const next = value === undefined ? rest : { ...rest, [name]: value };
  return Object.keys(next).length > 0 ? next : null;
};

/** Stored keys the component no longer declares */
export const undeclaredKeys = (
  stored: unknown,
  declarations: readonly PropDeclaration[]
): string[] => {
  const declared = new Set(declarations.map(({ name }) => name));
  return Object.keys(readValues(stored)).filter((key) => !declared.has(key));
};

const isMissing = {
  text: (value) => typeof value !== 'string' || value === '',
  textarea: (value) => typeof value !== 'string' || value === '',
  number: (value) => typeof value !== 'number' || !Number.isFinite(value),
  // false is a value, but absent is not: the form writes it once
  checkbox: (value) => typeof value !== 'boolean'
} as const satisfies Record<PropType, (value: unknown) => boolean>;

/** The required props with no usable value, as label (else name) */
export const missingRequired = (
  stored: unknown,
  declarations: readonly PropDeclaration[]
): string[] => {
  const values = readValues(stored);
  return declarations
    .filter(
      ({ name, type, required }) =>
        required === true && isMissing[type](values[name])
    )
    .map(({ name, label }) => label || name);
};

/**
 * The stored object with a `false` for every declared checkbox that holds no
 * boolean yet, so an untouched checkbox is a real `false`. Null when nothing
 * needs writing.
 */
export const withCheckboxDefaults = (
  stored: unknown,
  declarations: readonly PropDeclaration[]
): PropValues | null => {
  const values = readValues(stored);
  const absent = declarations.filter(
    ({ name, type }) => type === 'checkbox' && typeof values[name] !== 'boolean'
  );
  return absent.length === 0
    ? null
    : {
        ...values,
        ...Object.fromEntries(absent.map(({ name }) => [name, false]))
      };
};
