import ts from 'typescript';

import { matchesPackage } from './host-modules';
import type { ComponentDiagnostic } from './types';

const specifierOf = (node: ts.Node): ts.StringLiteralLike | undefined => {
  if (
    (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
    node.moduleSpecifier &&
    ts.isStringLiteralLike(node.moduleSpecifier)
  ) {
    return node.moduleSpecifier;
  }
  if (
    ts.isImportEqualsDeclaration(node) &&
    ts.isExternalModuleReference(node.moduleReference) &&
    ts.isStringLiteralLike(node.moduleReference.expression)
  ) {
    return node.moduleReference.expression;
  }
  if (
    ts.isCallExpression(node) &&
    (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
      (ts.isIdentifier(node.expression) &&
        node.expression.text === 'require')) &&
    node.arguments[0] &&
    ts.isStringLiteralLike(node.arguments[0])
  ) {
    return node.arguments[0];
  }
  return undefined;
};

/** Diagnostics for every import specifier outside the allowed set. */
export const scanImports = (
  sourceFile: ts.SourceFile,
  allowed: readonly string[]
): ComponentDiagnostic[] => {
  const diagnostics: ComponentDiagnostic[] = [];

  const visit = (node: ts.Node): void => {
    const literal = specifierOf(node);
    if (literal && !allowed.some((pkg) => matchesPackage(literal.text, pkg))) {
      const { line, character } = sourceFile.getLineAndCharacterOfPosition(
        literal.getStart(sourceFile)
      );
      diagnostics.push({
        message: `Import of "${literal.text}" is not allowed in a custom component`,
        line: line + 1,
        column: character + 1,
        severity: 'error'
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);

  return diagnostics;
};
