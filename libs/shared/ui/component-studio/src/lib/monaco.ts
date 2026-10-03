import type { Monaco, OnMount } from '@monaco-editor/react';

import type { BuildDiagnostic } from './build-state';
import { type MarkerSpec, toMarkers } from './check';
import type { EditorTypes } from './editor-types';
import type { TextEdit } from './insert-import';
import type { Shortcut } from './menu';

export type Editor = Parameters<OnMount>[0];
export type { Monaco };

/** Owner of the markers drawn from build and check findings */
export const MARKER_OWNER = 'cdwr-check';

const EDIT_SOURCE = 'cdwr-studio';

export const INDENT = { tabSize: 2, insertSpaces: true } as const;

const MIN_HEIGHT = 240;
const MAX_HEIGHT = 640;
const LINE_HEIGHT = 19;
const PADDING = 16;

/** Grows with the source up to a ceiling, past which the editor scrolls */
export const editorHeight = (lineCount: number): number =>
  Math.min(
    MAX_HEIGHT,
    Math.max(MIN_HEIGHT, Math.max(lineCount, 1) * LINE_HEIGHT + PADDING)
  );

/**
 * The model's uri; a `.tsx` extension is what turns JSX on in the worker, and
 * the `file:` scheme lets bare imports find the declarations' `node_modules`
 */
export const modelUri = (path: string): string =>
  `file:///studio/${path.replace(/[^\w/-]+/g, '-')}.tsx`;

/**
 * TypeScript defaults are global to the page, so this sets them once and never
 * puts them back: restoring raced a second mount of the editor and switched
 * semantic validation on again under it. The server build is the type-check
 * authority; Monaco has no types for `react` or the site kit, so only syntax
 * errors show.
 */
export const configureTypescript = (monaco: Monaco): void => {
  const defaults: typeof monaco.typescript | undefined = monaco.typescript;
  const typescriptDefaults = defaults?.typescriptDefaults;
  if (!defaults || !typescriptDefaults) {
    return;
  }
  typescriptDefaults.setCompilerOptions({
    ...typescriptDefaults.getCompilerOptions(),
    jsx: defaults.JsxEmit.ReactJSX,
    target: defaults.ScriptTarget.ESNext,
    allowNonTsExtensions: true
  });
  typescriptDefaults.setDiagnosticsOptions({
    ...typescriptDefaults.getDiagnosticsOptions(),
    noSemanticValidation: true,
    noSyntaxValidation: false
  });
};

/**
 * Gives the editor's TypeScript worker the declarations, so imports resolve
 * and the source is type-checked. Keeps what `configureTypescript` set.
 */
export const installEditorTypes = (
  monaco: Monaco,
  types: EditorTypes
): void => {
  const defaults: typeof monaco.typescript | undefined = monaco.typescript;
  const typescriptDefaults = defaults?.typescriptDefaults;
  if (!defaults || !typescriptDefaults) {
    return;
  }
  // One call: each `addExtraLib` re-sends the whole set to the worker
  typescriptDefaults.setExtraLibs(
    Object.entries(types.files).map(([path, content]) => ({
      filePath: `file:///${path}`,
      content
    }))
  );
  typescriptDefaults.setCompilerOptions({
    ...typescriptDefaults.getCompilerOptions(),
    baseUrl: 'file:///',
    paths: types.paths,
    moduleResolution: defaults.ModuleResolutionKind.NodeJs,
    jsx: defaults.JsxEmit.ReactJSX,
    target: defaults.ScriptTarget.ESNext,
    strict: true,
    skipLibCheck: true,
    esModuleInterop: true,
    allowNonTsExtensions: true,
    noEmit: true
  });
  typescriptDefaults.setDiagnosticsOptions({
    ...typescriptDefaults.getDiagnosticsOptions(),
    noSemanticValidation: false,
    noSyntaxValidation: false
  });
};

let typesLoad: Promise<void> | null = null;

/**
 * Loads and installs the declarations once per page: the defaults are global,
 * so the first studio's loader wins and later ones share its outcome. A failed
 * or empty load leaves the editor syntax-only.
 */
export const loadEditorTypes = (
  monaco: Monaco,
  load: () => Promise<EditorTypes | null>
): Promise<void> => {
  typesLoad ??= load().then(
    (types) => {
      if (types) {
        installEditorTypes(monaco, types);
      } else {
        console.warn('Editor types unavailable; checking syntax only');
      }
    },
    (error: unknown) => {
      console.warn('Editor types failed to load; checking syntax only', error);
    }
  );
  return typesLoad;
};

export const drawMarkers = (
  editor: Editor,
  monaco: Monaco,
  diagnostics: readonly BuildDiagnostic[]
): void => {
  const model = editor.getModel();
  if (!model) {
    return;
  }
  const severity = {
    error: monaco.MarkerSeverity.Error,
    warning: monaco.MarkerSeverity.Warning
  } as const satisfies Record<MarkerSpec['severity'], number>;

  monaco.editor.setModelMarkers(
    model,
    MARKER_OWNER,
    toMarkers(diagnostics, model.getLinesContent()).map((marker) => ({
      ...marker,
      severity: severity[marker.severity]
    }))
  );
};

/** One undoable edit; the cursor lands on `cursorOffset` when given */
export const applyTextEdit = (
  editor: Editor,
  monaco: Monaco,
  edit: TextEdit,
  cursorOffset?: number
): void => {
  const model = editor.getModel();
  if (!model) {
    return;
  }
  const start = model.getPositionAt(edit.start);
  const end = model.getPositionAt(edit.end);

  editor.pushUndoStop();
  editor.executeEdits(
    EDIT_SOURCE,
    [
      {
        range: new monaco.Range(
          start.lineNumber,
          start.column,
          end.lineNumber,
          end.column
        ),
        text: edit.text,
        forceMoveMarkers: true
      }
    ],
    cursorOffset === undefined
      ? undefined
      : () => {
          const at = model.getPositionAt(cursorOffset);
          return [
            new monaco.Selection(
              at.lineNumber,
              at.column,
              at.lineNumber,
              at.column
            )
          ];
        }
  );
  editor.pushUndoStop();
};

/** The key code and modifiers Monaco's `addCommand` takes */
export const toKeybinding = (monaco: Monaco, shortcut: Shortcut): number => {
  const keys = {
    F: monaco.KeyCode.KeyF,
    Enter: monaco.KeyCode.Enter
  } as const satisfies Record<Shortcut['key'], number>;

  return (
    keys[shortcut.key] |
    (shortcut.mod ? monaco.KeyMod.CtrlCmd : 0) |
    (shortcut.shift ? monaco.KeyMod.Shift : 0) |
    (shortcut.alt ? monaco.KeyMod.Alt : 0)
  );
};

/** Moves the cursor to a finding and brings it into view */
export const revealPosition = (
  editor: Editor,
  line: number,
  column: number
): void => {
  const position = {
    lineNumber: Math.max(line, 1),
    column: Math.max(column, 1)
  };
  editor.setPosition(position);
  editor.revealLineInCenterIfOutsideViewport(position.lineNumber);
  editor.focus();
};
