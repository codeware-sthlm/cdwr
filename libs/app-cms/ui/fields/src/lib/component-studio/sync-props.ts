import type { SyncOutcome } from '@codeware/shared/ui/component-studio';
import type { CustomComponent } from '@codeware/shared/util/payload-types';
import type {
  ComponentProp,
  ComponentPropKind
} from '@codeware/shared/util/payload-utils';

export type PropDeclaration = NonNullable<
  CustomComponent['propsSchema']
>[number];
export type PropType = PropDeclaration['type'];

type SuppliedKind = Exclude<ComponentPropKind, 'other'>;

/** The code-side type each form input supplies */
const suppliedKind = {
  text: 'string',
  textarea: 'string',
  number: 'number',
  checkbox: 'boolean'
} as const satisfies Record<PropType, SuppliedKind>;

/** The input a code type gets when the list has none that fits; null: none can */
const defaultType = {
  string: 'text',
  number: 'number',
  boolean: 'checkbox',
  other: null
} as const satisfies Record<ComponentPropKind, PropType | null>;

/** One row of the merged list; `from` is its index in the old list */
export type MergedRow = {
  name: string;
  label: string | null;
  type: PropType;
  required: boolean;
  from: number | null;
};

export type PropsMerge = {
  rows: MergedRow[];
  /** Indexes of the old rows that go */
  removeAt: number[];
  /** Names of the props added as new rows */
  added: string[];
  /** Names of the props whose rows went */
  removed: string[];
  /** Names of the rows that kept their place but changed type or required */
  updated: string[];
  /** Props of a type no form input can supply, so they were left out */
  skipped: string[];
  changed: boolean;
};

/**
 * The declared props that make the form supply what the code takes.
 *
 * Rows are matched by name. A row keeps its label, and its type when that
 * input still fits the code's type; the required flag follows the code. Props
 * the list lacks are added at the end, rows for props the code no longer
 * takes are removed. A row for a prop of a type no input can supply stays as
 * it is, since there is nothing to change it to.
 */
export const mergeProps = (
  existing: ReadonlyArray<PropDeclaration>,
  code: ReadonlyArray<ComponentProp>
): PropsMerge => {
  const byName = new Map(code.map((prop) => [prop.name, prop]));
  const rows: MergedRow[] = [];
  const removeAt: number[] = [];
  const added: string[] = [];
  const removed: string[] = [];
  const updated: string[] = [];
  const seen = new Set<string>();
  const skipped: string[] = [];

  existing.forEach((row, index) => {
    const prop = byName.get(row.name);
    if (!prop || seen.has(row.name)) {
      removeAt.push(index);
      removed.push(row.name);
      return;
    }
    seen.add(row.name);

    if (prop.kind === 'other') {
      skipped.push(prop.name);
      rows.push({
        name: row.name,
        label: row.label ?? null,
        type: row.type,
        required: row.required === true,
        from: index
      });
      return;
    }

    const type =
      suppliedKind[row.type] === prop.kind ? row.type : defaultType[prop.kind];
    const required = !prop.optional;
    if (type !== row.type || required !== (row.required === true)) {
      updated.push(row.name);
    }
    rows.push({
      name: row.name,
      label: row.label ?? null,
      type,
      required,
      from: index
    });
  });

  for (const prop of code) {
    if (seen.has(prop.name)) {
      continue;
    }
    const type = defaultType[prop.kind];
    if (!type) {
      skipped.push(prop.name);
      continue;
    }
    rows.push({
      name: prop.name,
      label: null,
      type,
      required: !prop.optional,
      from: null
    });
    added.push(prop.name);
  }

  return {
    rows,
    removeAt,
    added,
    removed,
    updated,
    skipped,
    changed: added.length + removed.length + updated.length > 0
  };
};

/** What the studio is told when the inputs were brought in line with the code */
export const toSyncOutcome = ({
  changed,
  added,
  removed,
  updated,
  skipped
}: PropsMerge): SyncOutcome =>
  changed
    ? { status: 'changed', added, removed, updated, skipped }
    : { status: 'unchanged', skipped };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isPropType = (value: unknown): value is PropType =>
  typeof value === 'string' && Object.hasOwn(suppliedKind, value);

/** The rows of the form's `propsSchema`, from its untyped value. */
export const readPropsSchema = (value: unknown): PropDeclaration[] =>
  Array.isArray(value)
    ? value.flatMap((entry: unknown): PropDeclaration[] => {
        if (!isRecord(entry)) {
          return [];
        }
        const { name, label, type, required } = entry;
        return typeof name === 'string' && isPropType(type)
          ? [
              {
                name,
                label: typeof label === 'string' ? label : null,
                type,
                required: required === true
              }
            ]
          : [];
      })
    : [];
