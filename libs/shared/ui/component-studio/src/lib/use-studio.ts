import type { ComponentProp } from '@codeware/shared/util/payload-utils';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { StudioBuild } from './build-state';
import { importLabel } from './catalog';
import type { CheckOutcome, CheckResult } from './check';
import { type CheckFindings, listedFindings, markedFindings } from './findings';
import { formatSource } from './format-source';
import { type ImportRequest, planImport } from './insert-import';
import {
  type ActionResult,
  type BusyTask,
  type SyncOutcome,
  countFindings
} from './last-action';
import type { CommandId } from './menu';
import { type Editor, type Monaco, applyTextEdit, drawMarkers } from './monaco';

export type StudioHandlers = {
  onCheck: (source: string) => Promise<CheckOutcome>;
  onSyncInputs?: (
    props: readonly ComponentProp[]
  ) => SyncOutcome | Promise<SyncOutcome>;
};

type Args = StudioHandlers & {
  readOnly: boolean;
  build: StudioBuild | null;
  openPicker: () => void;
  togglePanel: () => void;
  toggleFullscreen: () => void;
};

const buildKey = (build: StudioBuild | null): string =>
  build ? `${build.status}|${build.builtAt}|${build.hash}` : 'none';

const errorMessage = (error: unknown): string =>
  error instanceof Error && error.message ? error.message : 'unexpected error';

/**
 * What the studio does: format, insert an import, check the source and hand
 * the declared props to the host. Findings are drawn as markers on the
 * editor's model under their own owner.
 */
export const useStudio = ({
  onCheck,
  onSyncInputs,
  readOnly,
  build,
  openPicker,
  togglePanel,
  toggleFullscreen
}: Args) => {
  const handle = useRef<{ editor: Editor; monaco: Monaco } | null>(null);
  const [mounted, setMounted] = useState(false);
  const [busy, setBusy] = useState<BusyTask | null>(null);
  const busyRef = useRef<BusyTask | null>(null);
  const [last, setLast] = useState<ActionResult | null>(null);
  const [check, setCheck] = useState<CheckFindings | null>(null);
  const checked = useRef<{ source: string; result: CheckResult } | null>(null);

  // The stored build describes the source it was built from, so an edit
  // retires its markers until the next build replaces it
  const key = buildKey(build);
  const keyRef = useRef(key);
  keyRef.current = key;
  const [editedFor, setEditedFor] = useState<string | null>(null);
  const edited = editedFor === key;

  const start = useCallback((task: BusyTask) => {
    busyRef.current = task;
    setBusy(task);
  }, []);
  const finish = useCallback(() => {
    busyRef.current = null;
    setBusy(null);
  }, []);

  const source = useCallback(
    () => handle.current?.editor.getModel()?.getValue() ?? '',
    []
  );

  const attach = useCallback((editor: Editor, monaco: Monaco) => {
    handle.current = { editor, monaco };
    setMounted(true);
    const listener = editor.onDidChangeModelContent(() => {
      checked.current = null;
      setCheck(null);
      setLast(null);
      setEditedFor(keyRef.current);
    });
    editor.onDidDispose(() => {
      listener.dispose();
      handle.current = null;
      setMounted(false);
    });
  }, []);

  useEffect(() => {
    if (!mounted || !handle.current) {
      return;
    }
    drawMarkers(
      handle.current.editor,
      handle.current.monaco,
      markedFindings({ build, check, edited })
    );
  }, [mounted, build, check, edited]);

  const format = useCallback(async () => {
    const current = handle.current;
    if (!current || readOnly || busyRef.current) {
      return;
    }
    const before = source();
    const position = current.editor.getPosition();
    const model = current.editor.getModel();
    start('format');
    const result = await formatSource(
      before,
      position && model ? model.getOffsetAt(position) : 0
    );
    finish();

    // Typed over while Prettier ran; its answer is for text that is gone
    if (source() !== before) {
      return;
    }
    switch (result.status) {
      case 'formatted':
        applyTextEdit(
          current.editor,
          current.monaco,
          { start: 0, end: before.length, text: result.text },
          result.cursorOffset
        );
        setLast({ kind: 'format', changed: true });
        break;
      case 'unchanged':
        setLast({ kind: 'format', changed: false });
        break;
      case 'error':
        setLast({
          kind: 'format-error',
          message: result.message,
          line: result.line,
          column: result.column
        });
        break;
    }
    current.editor.focus();
  }, [finish, readOnly, source, start]);

  const insertImport = useCallback(
    (request: ImportRequest) => {
      const current = handle.current;
      if (!current || readOnly) {
        return;
      }
      const edit = planImport(source(), request);
      const label = importLabel(request);
      if (edit) {
        applyTextEdit(current.editor, current.monaco, edit);
      }
      setLast({ kind: 'import', label, added: edit !== null });
      current.editor.focus();
    },
    [readOnly, source]
  );

  /** Builds `text` on the server; never throws */
  const ask = useCallback(
    async (text: string) => {
      const began = performance.now();
      let outcome: CheckOutcome;
      try {
        outcome = await onCheck(text);
      } catch {
        outcome = { status: 'failed' };
      }
      return { outcome, durationMs: performance.now() - began };
    },
    [onCheck]
  );

  /**
   * Keeps a result only while the source still is what was checked; false when
   * it was dropped, so the caller reports nothing either.
   */
  const keep = useCallback(
    (text: string, result: CheckResult): boolean => {
      if (source() !== text) {
        return false;
      }
      checked.current = { source: text, result };
      setCheck({ diagnostics: result.diagnostics });
      return true;
    },
    [source]
  );

  const runCheck = useCallback(async () => {
    if (busyRef.current) {
      return;
    }
    const text = source();
    start('check');
    const { outcome, durationMs } = await ask(text);
    finish();

    if (outcome.status !== 'done') {
      setLast({
        kind: 'check-failed',
        reason: outcome.status === 'forbidden' ? 'forbidden' : 'unreachable'
      });
      return;
    }
    if (!keep(text, outcome.result)) {
      return;
    }
    setLast({
      kind: 'check',
      ...countFindings(outcome.result.diagnostics),
      durationMs
    });
  }, [ask, finish, keep, source, start]);

  const syncInputs = useCallback(async () => {
    if (busyRef.current || readOnly || !onSyncInputs) {
      return;
    }
    const text = source();
    start('sync');

    let result =
      checked.current?.source === text ? checked.current.result : null;
    if (!result) {
      const { outcome } = await ask(text);
      if (outcome.status !== 'done') {
        finish();
        setLast({
          kind: 'check-failed',
          reason: outcome.status === 'forbidden' ? 'forbidden' : 'unreachable'
        });
        return;
      }
      // Edited while it ran: nothing to sync, nothing to report
      if (!keep(text, outcome.result)) {
        finish();
        return;
      }
      result = outcome.result;
    }

    const { props } = result;
    if (!props) {
      finish();
      setLast({ kind: 'sync-unresolved' });
      return;
    }
    try {
      const outcome = await onSyncInputs(props);
      setLast({ kind: 'sync', outcome });
    } catch (error) {
      setLast({ kind: 'sync-failed', message: errorMessage(error) });
    } finally {
      finish();
    }
  }, [ask, finish, keep, onSyncInputs, readOnly, source, start]);

  const run = useMemo(
    () =>
      ({
        format: () => void format(),
        import: openPicker,
        check: () => void runCheck(),
        sync: () => void syncInputs(),
        togglePanel,
        fullscreen: toggleFullscreen
      }) satisfies Record<CommandId, () => void>,
    [format, openPicker, runCheck, syncInputs, togglePanel, toggleFullscreen]
  );

  return {
    attach,
    busy,
    last,
    run,
    insertImport,
    handle,
    findings: listedFindings({ build, check, edited }),
    checked: check !== null
  };
};
