'use client';

import { CodeField } from '@payloadcms/ui';
import type { CodeFieldClientProps } from 'payload';
import React, { useCallback } from 'react';

import SourceToolbar from './SourceToolbar';
import { indentOptions, tsxModelUri } from './tsx-source';
import { useSourceTools } from './use-source-tools';

type OnMount = NonNullable<React.ComponentProps<typeof CodeField>['onMount']>;

/**
 * Code field for a React component written in TSX.
 *
 * Monaco reads the script kind from the model's file extension, so the
 * editor's model is swapped for one with a `.tsx` uri. Semantic validation is
 * off: the server build is the type-check authority, and Monaco has no types
 * for `react` or the site kit. Syntax errors still show.
 *
 * A toolbar above the editor formats, inserts imports, checks the unsaved
 * source on the server and syncs the declared props from the code.
 *
 * Monaco's TypeScript defaults are global to the admin session, so every
 * `typescript` editor opened after this one shares these options.
 */
const TsxSource: React.FC<CodeFieldClientProps> = ({
  autoComplete,
  field,
  forceRender,
  path,
  permissions,
  readOnly,
  renderedBlocks,
  schemaPath,
  validate
}) => {
  const tools = useSourceTools();
  const { attach } = tools;

  const onMount = useCallback<OnMount>(
    (editor, monaco) => {
      const uri = monaco.Uri.parse(tsxModelUri(path));
      const original = editor.getModel();

      // A model left over from an earlier mount would hold stale text
      monaco.editor.getModel(uri)?.dispose();
      const model = monaco.editor.createModel(
        original?.getValue() ?? '',
        'typescript',
        uri
      );
      editor.setModel(model);
      original?.dispose();
      const detach = attach(editor, monaco);

      // Payload sets the model's indentation right after this callback returns
      void Promise.resolve().then(() => model.updateOptions(indentOptions));

      const defaults: typeof monaco.typescript | undefined = monaco.typescript;
      const typescriptDefaults = defaults?.typescriptDefaults;
      const previousCompiler = typescriptDefaults?.getCompilerOptions();
      const previousDiagnostics = typescriptDefaults?.getDiagnosticsOptions();

      if (defaults && typescriptDefaults) {
        typescriptDefaults.setCompilerOptions({
          ...previousCompiler,
          jsx: defaults.JsxEmit.ReactJSX,
          target: defaults.ScriptTarget.ESNext,
          allowNonTsExtensions: true
        });
        typescriptDefaults.setDiagnosticsOptions({
          ...previousDiagnostics,
          noSemanticValidation: true,
          noSyntaxValidation: false
        });
      }

      // The defaults are left as set: putting them back raced a second mount
      // of the editor and switched semantic validation on again under it
      editor.onDidDispose(() => {
        detach();
        model.dispose();
      });
    },
    [attach, path]
  );

  return (
    <>
      {!readOnly && <SourceToolbar tools={tools} />}
      <CodeField
        autoComplete={autoComplete}
        field={field}
        forceRender={forceRender}
        onMount={onMount}
        path={path}
        permissions={permissions}
        readOnly={readOnly}
        renderedBlocks={renderedBlocks}
        schemaPath={schemaPath}
        validate={validate}
      />
    </>
  );
};

export default TsxSource;
