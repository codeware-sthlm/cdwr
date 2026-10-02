'use client';

import type {
  TranslationsKeys,
  TranslationsObject
} from '@codeware/app-cms/util/i18n';
import { Button } from '@codeware/shared/ui/shadcn/components/button';
import { CodeField, useTranslation } from '@payloadcms/ui';
import type { CodeFieldClientProps } from 'payload';
import React, { useCallback, useRef } from 'react';

import { tsxModelUri } from './tsx-source';

type OnMount = NonNullable<React.ComponentProps<typeof CodeField>['onMount']>;
type Editor = Parameters<OnMount>[0];

const indentOptions = { tabSize: 2, insertSpaces: true } as const;

/**
 * Code field for a React component written in TSX.
 *
 * Monaco reads the script kind from the model's file extension, so the
 * editor's model is swapped for one with a `.tsx` uri. Semantic validation is
 * off: the server build is the type-check authority, and Monaco has no types
 * for `react` or the site kit. Syntax errors still show.
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
  const { t } = useTranslation<TranslationsObject, TranslationsKeys>();
  const editorRef = useRef<Editor | null>(null);

  const format = useCallback(() => {
    const editor = editorRef.current;
    // The TypeScript formatter reads its indentation from the model
    editor?.getModel()?.updateOptions(indentOptions);
    void editor?.getAction('editor.action.formatDocument')?.run();
  }, []);

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
      editorRef.current = editor;

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
        editorRef.current = null;
        model.dispose();
      });
    },
    [path]
  );

  return (
    <>
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
      {!readOnly && (
        <div className="twp mt-2 flex justify-end">
          <Button type="button" variant="outline" size="sm" onClick={format}>
            {t('customComponents:formatSource')}
          </Button>
        </div>
      )}
    </>
  );
};

export default TsxSource;
