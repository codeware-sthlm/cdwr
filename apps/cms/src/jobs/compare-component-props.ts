import type {
  ComponentDiagnostic,
  ComponentProp,
  ComponentPropKind
} from '@codeware/app-cms/feature/component-builder';
import type { CustomComponent } from '@codeware/shared/util/payload-types';

type PropDeclaration = NonNullable<CustomComponent['propsSchema']>[number];
type PropType = PropDeclaration['type'];

/** The code-side type each form input supplies */
const suppliedKind = {
  text: 'string',
  textarea: 'string',
  number: 'number',
  checkbox: 'boolean'
} as const satisfies Record<PropType, Exclude<ComponentPropKind, 'other'>>;

/** Line and column 0: the finding is about the declaration, not a source line */
const finding = (
  severity: ComponentDiagnostic['severity'],
  message: string
): ComponentDiagnostic => ({ message, line: 0, column: 0, severity });

const warn = (message: string) => finding('warning', message);

/**
 * Where a component's code and its declared props disagree.
 *
 * A type the form would fill in wrongly is an error, since the component
 * would be handed a value it does not expect. The rest are warnings. Nothing
 * is compared when the code's props could not be resolved.
 */
export const compareComponentProps = (
  code: readonly ComponentProp[] | undefined,
  schema: readonly PropDeclaration[] | null | undefined
): ComponentDiagnostic[] => {
  if (!code) {
    return [];
  }
  const declared = new Map((schema ?? []).map((d) => [d.name, d]));
  const taken = new Set(code.map(({ name }) => name));
  const warnings: ComponentDiagnostic[] = [];

  for (const prop of code) {
    const declaration = declared.get(prop.name);
    const name = `\`${prop.name}\``;

    if (!declaration) {
      warnings.push(
        warn(
          prop.optional
            ? `${name} is not declared in Props, so editors cannot set it.`
            : `${name} is required by the component but not declared in Props, so it will be undefined.`
        )
      );
      continue;
    }

    if (prop.kind === 'other') {
      warnings.push(
        warn(
          `${name} has a type the form cannot fill in. It can only supply text, numbers and checkboxes.`
        )
      );
    } else if (suppliedKind[declaration.type] !== prop.kind) {
      warnings.push(
        finding(
          'error',
          `${name} is declared as \`${declaration.type}\` but the component takes a ${prop.kind}.`
        )
      );
    }

    if (!prop.optional && !declaration.required) {
      warnings.push(
        warn(
          `${name} is required by the component but not marked required in Props, so it can be undefined.`
        )
      );
    }
  }

  for (const { name } of declared.values()) {
    if (!taken.has(name)) {
      warnings.push(
        warn(
          `\`${name}\` is declared in Props but the component does not take it, so it has no effect.`
        )
      );
    }
  }

  return warnings;
};
