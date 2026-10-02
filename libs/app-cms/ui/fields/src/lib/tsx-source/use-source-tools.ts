import type {
  TranslationsKeys,
  TranslationsObject
} from '@codeware/app-cms/util/i18n';
import {
  useConfig,
  useForm,
  useFormFields,
  useTranslation
} from '@payloadcms/ui';
import type { CodeField } from '@payloadcms/ui';
import {
  type ComponentProps,
  useCallback,
  useEffect,
  useRef,
  useState
} from 'react';

import { parseDiagnostics } from '../build-status/build-status';

import {
  type CheckOutcome,
  type CheckResult,
  requestCheck,
  toMarkers,
  unlocated
} from './check';
import { type ImportRequest, planImport } from './insert-import';
import { type MergedRow, mergeProps, readPropsSchema } from './sync-props';
import { indentOptions } from './tsx-source';

type OnMount = NonNullable<ComponentProps<typeof CodeField>['onMount']>;
export type Editor = Parameters<OnMount>[0];
export type Monaco = Parameters<OnMount>[1];

type Diagnostic = CheckResult['diagnostics'][number];

const MARKER_OWNER = 'cdwr-check';
const IMPORT_EDIT_SOURCE = 'cdwr-import';
const PROPS_PATH = 'propsSchema';
const SLUG_PATH = 'slug';

export type Notice = {
  tone: 'ok' | 'warn' | 'error' | 'muted';
  text: string;
};

export type SourceTools = {
  /** Called once the editor exists; returns what to call when it goes */
  attach: (editor: Editor, monaco: Monaco) => () => void;
  format: () => void;
  insertImport: (request: ImportRequest) => void;
  check: () => void;
  syncProps: () => void;
  busy: 'check' | 'sync' | null;
  notice: Notice | null;
  /** Findings that point at no line, which markers cannot show */
  unlocated: Diagnostic[];
};

const fieldState = (value: unknown) => ({
  value,
  initialValue: value,
  valid: true,
  passesCondition: true
});

/** The state of a new `propsSchema` row, field by field */
const rowState = ({ name, label, type, required }: MergedRow) => ({
  name: fieldState(name),
  label: fieldState(label),
  type: fieldState(type),
  required: fieldState(required)
});

/**
 * What the source editor's toolbar does: format, insert an import, check the
 * unsaved source on the server and bring the `propsSchema` rows in line with
 * the code.
 *
 * Findings are drawn as markers on the editor's model under their own owner.
 */
export const useSourceTools = (): SourceTools => {
  const { t } = useTranslation<TranslationsObject, TranslationsKeys>();
  const { config } = useConfig();
  const {
    getDataByPath,
    addFieldRow,
    removeFieldRow,
    dispatchFields,
    setModified
  } = useForm();

  const apiRoute = config.routes.api;
  const [mounted, setMounted] = useState<{
    editor: Editor;
    monaco: Monaco;
  } | null>(null);
  const [busy, setBusy] = useState<SourceTools['busy']>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [findings, setFindings] = useState<Diagnostic[]>([]);
  const checked = useRef<{ source: string; result: CheckResult } | null>(null);
  const checkedAny = useRef(false);

  const storedStatus = useFormFields(
    ([fields]) => fields['build.status']?.value
  );
  const storedDiagnostics = useFormFields(
    ([fields]) => fields['build.diagnostics']?.value
  );

  const mark = useCallback(
    (diagnostics: readonly Diagnostic[]) => {
      const model = mounted?.editor.getModel();
      if (!mounted || !model) {
        return;
      }
      const { monaco } = mounted;
      const severity = {
        error: monaco.MarkerSeverity.Error,
        warning: monaco.MarkerSeverity.Warning
      } as const satisfies Record<Diagnostic['severity'], number>;

      monaco.editor.setModelMarkers(
        model,
        MARKER_OWNER,
        toMarkers(diagnostics, model.getLinesContent()).map((marker) => ({
          ...marker,
          severity: severity[marker.severity]
        }))
      );
    },
    [mounted]
  );

  // Findings go stale with the first edit after them
  useEffect(() => {
    const model = mounted?.editor.getModel();
    if (!mounted || !model) {
      return;
    }
    const listener = mounted.editor.onDidChangeModelContent(() => {
      mounted.monaco.editor.setModelMarkers(model, MARKER_OWNER, []);
      setNotice(null);
      setFindings([]);
    });
    return () => listener.dispose();
  }, [mounted]);

  // The failed build the document was saved with, until a check replaces it
  useEffect(() => {
    if (storedStatus === 'failed' && !checkedAny.current) {
      mark(parseDiagnostics(storedDiagnostics));
    }
  }, [mark, storedStatus, storedDiagnostics]);

  const attach = useCallback<SourceTools['attach']>((editor, monaco) => {
    setMounted({ editor, monaco });
    return () => setMounted(null);
  }, []);

  const format = useCallback(() => {
    const editor = mounted?.editor;
    // The TypeScript formatter reads its indentation from the model
    editor?.getModel()?.updateOptions(indentOptions);
    void editor?.getAction('editor.action.formatDocument')?.run();
  }, [mounted]);

  const insertImport = useCallback(
    (request: ImportRequest) => {
      const model = mounted?.editor.getModel();
      if (!mounted || !model) {
        return;
      }
      const edit = planImport(model.getValue(), request);
      if (!edit) {
        setNotice({ tone: 'muted', text: t('customComponents:importPresent') });
        return;
      }
      const start = model.getPositionAt(edit.start);
      const end = model.getPositionAt(edit.end);

      mounted.editor.pushUndoStop();
      mounted.editor.executeEdits(IMPORT_EDIT_SOURCE, [
        {
          range: new mounted.monaco.Range(
            start.lineNumber,
            start.column,
            end.lineNumber,
            end.column
          ),
          text: edit.text,
          forceMoveMarkers: true
        }
      ]);
      mounted.editor.pushUndoStop();
      mounted.editor.focus();
    },
    [mounted, t]
  );

  /** Builds the editor's current source; never throws. */
  const runCheck = useCallback(async (): Promise<
    CheckOutcome & { source: string }
  > => {
    const source = mounted?.editor.getModel()?.getValue() ?? '';
    const slug = getDataByPath(SLUG_PATH);
    const outcome = await requestCheck({
      apiRoute,
      body: {
        source,
        ...(typeof slug === 'string' && slug ? { slug } : {}),
        propsSchema: readPropsSchema(getDataByPath(PROPS_PATH)).map(
          ({ name, type, required }) => ({
            name,
            type,
            required: required === true
          })
        )
      }
    });
    return { ...outcome, source };
  }, [apiRoute, getDataByPath, mounted]);

  const failureNotice = useCallback(
    (outcome: Exclude<CheckOutcome, { status: 'done' }>): Notice => ({
      tone: 'error',
      text: t(
        outcome.status === 'forbidden'
          ? 'customComponents:checkForbidden'
          : 'customComponents:checkFailed'
      )
    }),
    [t]
  );

  const show = useCallback(
    (source: string, result: CheckResult) => {
      checked.current = { source, result };
      checkedAny.current = true;
      mark(result.diagnostics);
      setFindings(unlocated(result.diagnostics));
    },
    [mark]
  );

  const check = useCallback(async () => {
    setBusy('check');
    setNotice(null);
    const outcome = await runCheck();
    setBusy(null);

    if (outcome.status !== 'done') {
      setNotice(failureNotice(outcome));
      return;
    }
    show(outcome.source, outcome.result);

    const { diagnostics } = outcome.result;
    const count = diagnostics.length;
    if (count === 0) {
      setNotice({ tone: 'ok', text: t('customComponents:checkNone') });
      return;
    }
    setNotice({
      tone: outcome.result.ok ? 'warn' : 'error',
      text:
        count === 1
          ? t('customComponents:checkOneProblem')
          : t('customComponents:checkProblems', { count })
    });
  }, [failureNotice, runCheck, show, t]);

  const applyRows = useCallback(
    (
      merge: ReturnType<typeof mergeProps>,
      current: ReturnType<typeof readPropsSchema>
    ) => {
      for (const rowIndex of [...merge.removed].reverse()) {
        removeFieldRow({ path: PROPS_PATH, rowIndex });
      }
      merge.rows.forEach((row, rowIndex) => {
        if (row.from === null) {
          addFieldRow({
            path: PROPS_PATH,
            schemaPath: PROPS_PATH,
            rowIndex,
            subFieldState: rowState(row)
          });
          return;
        }
        const before = current[row.from];
        if (before?.type !== row.type) {
          dispatchFields({
            type: 'UPDATE',
            path: `${PROPS_PATH}.${rowIndex}.type`,
            value: row.type
          });
        }
        if ((before?.required === true) !== row.required) {
          dispatchFields({
            type: 'UPDATE',
            path: `${PROPS_PATH}.${rowIndex}.required`,
            value: row.required
          });
        }
      });
      setModified(true);
    },
    [addFieldRow, dispatchFields, removeFieldRow, setModified]
  );

  const syncProps = useCallback(async () => {
    setBusy('sync');
    setNotice(null);

    const source = mounted?.editor.getModel()?.getValue() ?? '';
    let result =
      checked.current?.source === source ? checked.current.result : null;
    if (!result) {
      const outcome = await runCheck();
      if (outcome.status !== 'done') {
        setBusy(null);
        setNotice(failureNotice(outcome));
        return;
      }
      show(outcome.source, outcome.result);
      result = outcome.result;
    }
    setBusy(null);

    if (!result.props) {
      setNotice({ tone: 'error', text: t('customComponents:syncUnresolved') });
      return;
    }

    const current = readPropsSchema(getDataByPath(PROPS_PATH));
    const merge = mergeProps(current, result.props);
    const skipped =
      merge.skipped.length > 0
        ? ` ${t('customComponents:syncSkipped', { names: merge.skipped.join(', ') })}`
        : '';

    if (!merge.changed) {
      setNotice({
        tone: 'muted',
        text: `${t('customComponents:syncUpToDate')}${skipped}`
      });
      return;
    }
    applyRows(merge, current);
    setNotice({
      tone: 'ok',
      text: `${t('customComponents:syncDone')}${skipped}`
    });
  }, [applyRows, failureNotice, getDataByPath, mounted, runCheck, show, t]);

  return {
    attach,
    format,
    insertImport,
    check: () => void check(),
    syncProps: () => void syncProps(),
    busy,
    notice,
    unlocated: findings
  };
};
