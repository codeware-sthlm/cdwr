/** A replacement of `source.slice(start, end)` */
export type TextEdit = { start: number; end: number; text: string };

/** What to import; no name asks for an empty named import to fill in */
export type ImportRequest = { module: string; name: string | null };

type ParsedImport = {
  /** Offset of the statement's first character */
  start: number;
  /** Offset just past the statement, its semicolon included */
  end: number;
  module: string;
  quote: string;
  typeOnly: boolean;
  /** The text between `import` and `from`, without the keyword */
  clause: string;
  /** Offset of `clause` in the source */
  clauseStart: number;
};

const IMPORT_PATTERN =
  /^import\b(\s+type\b)?([^'";]*?)(['"])([^'"\n]*)\3[ \t]*;?/gm;

/** What can stand between `import` and the module: nothing, or bindings and `from` */
const isImportClause = (clause: string) =>
  clause.trim() === '' || /\bfrom\s*$/.test(clause);

const parseImports = (source: string): ParsedImport[] =>
  [...source.matchAll(IMPORT_PATTERN)]
    .filter((match) => isImportClause(match[2] ?? ''))
    .map((match) => {
      const typeKeyword = match[1] ?? '';
      const clauseStart = match.index + 'import'.length + typeKeyword.length;
      return {
        start: match.index,
        end: match.index + match[0].length,
        module: match[4] ?? '',
        quote: match[3] ?? "'",
        typeOnly: typeKeyword !== '',
        clause: match[2] ?? '',
        clauseStart
      };
    });

/** Splits a clause into its default binding and the text inside its braces. */
const splitClause = (
  clause: string
): { defaultName: string | null; named: string | null } | null => {
  const text = clause.replace(/\s*\bfrom\s*$/, '').trim();
  if (text === '') {
    return null;
  }
  const braced = /^(?:([A-Za-z_$][\w$]*)\s*,\s*)?\{([^{}]*)\}$/.exec(text);
  if (braced) {
    return { defaultName: braced[1] ?? null, named: braced[2] ?? '' };
  }
  return /^[A-Za-z_$][\w$]*$/.test(text)
    ? { defaultName: text, named: null }
    : null;
};

const importedNames = (named: string): string[] =>
  named
    .split(',')
    .map((part) => part.replace(/^\s*type\s+/, '').trim())
    .filter(Boolean)
    .map((part) => part.split(/\s+as\s+/)[0] ?? part);

const hasComment = (text: string) => /\/\/|\/\*/.test(text);

/** Where the leading comments and directives end. */
const headerEnd = (source: string): number => {
  let offset = 0;
  const lines = source.split('\n');
  let inBlock = false;

  for (const line of lines) {
    const trimmed = line.trim();
    const header =
      inBlock ||
      trimmed === '' ||
      trimmed.startsWith('//') ||
      trimmed.startsWith('/*') ||
      /^(['"])use [a-z ]+\1;?$/.test(trimmed);
    if (!header) {
      break;
    }
    if (!inBlock && trimmed.startsWith('/*') && !trimmed.includes('*/')) {
      inBlock = true;
    } else if (inBlock && trimmed.includes('*/')) {
      inBlock = false;
    }
    offset += line.length + 1;
  }
  return Math.min(offset, source.length);
};

const importLine = ({ module, name }: ImportRequest, quote: string) =>
  `import ${name === null ? '{}' : `{ ${name} }`} from ${quote}${module}${quote};`;

const newImport = (
  source: string,
  request: ImportRequest,
  imports: readonly ParsedImport[]
): TextEdit => {
  const last = imports.at(-1);
  const line = importLine(request, last?.quote ?? "'");

  if (last) {
    const lineEnd = source.indexOf('\n', last.end);
    const at = lineEnd === -1 ? source.length : lineEnd;
    return { start: at, end: at, text: `\n${line}` };
  }

  const at = headerEnd(source);
  const before = at > 0 && !source.slice(0, at).endsWith('\n\n') ? '\n' : '';
  const next = source.slice(at);
  const after = next.trim() === '' || next.startsWith('\n') ? '' : '\n';
  return { start: at, end: at, text: `${before}${line}\n${after}` };
};

/** Adds `name` to the braces of a value import, or null when it cannot. */
const addToImport = (
  source: string,
  existing: ParsedImport,
  name: string
): TextEdit | null => {
  const parts = splitClause(existing.clause);
  if (!parts) {
    return null;
  }

  if (parts.named === null) {
    // `import React from 'react'` becomes `import React, { name } from 'react'`
    const defaultEnd =
      existing.clauseStart +
      existing.clause.indexOf(parts.defaultName ?? '') +
      (parts.defaultName?.length ?? 0);
    return { start: defaultEnd, end: defaultEnd, text: `, { ${name} }` };
  }

  const open = source.indexOf('{', existing.clauseStart);
  const close = source.indexOf('}', open);
  const inner = source.slice(open + 1, close);
  if (hasComment(inner)) {
    return null;
  }

  const content = inner.trimEnd();
  if (content.trim() === '') {
    return { start: open + 1, end: close, text: ` ${name} ` };
  }

  const at = open + 1 + content.length;
  const trailingComma = content.endsWith(',');

  if (inner.includes('\n')) {
    const lastLine = content.slice(content.lastIndexOf('\n') + 1);
    const indent = /^\s*/.exec(lastLine)?.[0] ?? '  ';
    return {
      start: at,
      end: at,
      text: trailingComma ? `\n${indent}${name},` : `,\n${indent}${name}`
    };
  }

  return {
    start: at,
    end: at,
    text: trailingComma ? ` ${name},` : `, ${name}`
  };
};

/**
 * The edit that makes `request` importable from `source`, or null when the
 * source already has it.
 *
 * A name joins the braces of an existing import of the module; any shape the
 * edit cannot be sure about gets a new line after the last import instead.
 */
export const planImport = (
  source: string,
  request: ImportRequest
): TextEdit | null => {
  const imports = parseImports(source);
  const fromModule = imports.filter(
    ({ module, typeOnly }) => module === request.module && !typeOnly
  );

  if (request.name === null) {
    return fromModule.length > 0 ? null : newImport(source, request, imports);
  }

  const { name } = request;
  const already = fromModule.some(({ clause }) => {
    const parts = splitClause(clause);
    return parts?.named != null && importedNames(parts.named).includes(name);
  });
  if (already) {
    return null;
  }

  for (const existing of fromModule) {
    const edit = addToImport(source, existing, name);
    if (edit) {
      return edit;
    }
  }
  return newImport(source, request, imports);
};

export const applyEdit = (source: string, edit: TextEdit): string =>
  source.slice(0, edit.start) + edit.text + source.slice(edit.end);
