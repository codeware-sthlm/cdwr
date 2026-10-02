import ts from 'typescript';

import type { ComponentProp, ComponentPropKind } from './types';

/** Props React supplies itself; an author never sets them. */
const RESERVED = new Set(['children', 'key', 'ref']);

const kindOfType = (type: ts.Type): ComponentPropKind => {
  const kinds = new Set<ComponentPropKind>();
  for (const member of type.isUnion() ? type.types : [type]) {
    kinds.add(
      member.flags & ts.TypeFlags.StringLike
        ? 'string'
        : member.flags & ts.TypeFlags.NumberLike
          ? 'number'
          : member.flags & ts.TypeFlags.BooleanLike
            ? 'boolean'
            : 'other'
    );
  }
  const [only] = kinds;
  return kinds.size === 1 && only ? only : 'other';
};

/**
 * The props the default export takes, read from its first parameter.
 * Undefined when the export has no call signature or its props are untyped.
 */
export const extractProps = (
  checker: ts.TypeChecker,
  moduleSymbol: ts.Symbol,
  location: ts.Node
): ComponentProp[] | undefined => {
  const exported = checker.tryGetMemberInModuleExports('default', moduleSymbol);
  if (!exported) {
    return undefined;
  }
  const target =
    exported.flags & ts.SymbolFlags.Alias
      ? checker.getAliasedSymbol(exported)
      : exported;

  const [signature] = checker
    .getTypeOfSymbolAtLocation(target, location)
    .getCallSignatures();
  if (!signature) {
    return undefined;
  }

  const [param] = signature.getParameters();
  if (!param) {
    return [];
  }
  const propsType = checker.getTypeOfSymbolAtLocation(param, location);
  if (propsType.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) {
    return undefined;
  }

  return checker
    .getPropertiesOfType(propsType)
    .filter((prop) => !RESERVED.has(prop.name))
    .map((prop) => ({
      name: prop.name,
      kind: kindOfType(
        checker.getNonNullableType(
          checker.getTypeOfSymbolAtLocation(prop, location)
        )
      ),
      optional: (prop.flags & ts.SymbolFlags.Optional) !== 0
    }));
};
