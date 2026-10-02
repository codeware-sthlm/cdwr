'use client';

import { Button } from '@codeware/shared/ui/shadcn/components/button';
import { cn } from '@codeware/shared/util/ui';
import type { OnMount } from '@monaco-editor/react';
import { XIcon } from 'lucide-react';
import { type ReactNode, useCallback, useId, useRef, useState } from 'react';

import type { StudioBuild } from './build-state';
import type { ImportCatalog } from './catalog';
import { ImportPicker } from './ImportPicker';
import { boundCommands, buildMenus } from './menu';
import { revealPosition, toKeybinding } from './monaco';
import { SourceEditor } from './SourceEditor';
import { StatusStrip } from './StatusStrip';
import { stripModel } from './strip';
import { StudioToolbar } from './StudioToolbar';
import { type StudioHandlers, useStudio } from './use-studio';

export type ComponentStudioProps = StudioHandlers & {
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
  /** Picks the editor's theme; the rest follows the surrounding tokens */
  colorScheme: 'light' | 'dark';
  /** The stored build, or null before there is one */
  build: StudioBuild | null;
  catalog: ImportCatalog;
  sidePanel?: ReactNode;
  sidePanelTitle?: string;
  defaultPanelOpen?: boolean;
  /** Names the editor's model; each studio gets its own unless told otherwise */
  modelPath?: string;
  /** Added to what portals out of the studio (menus, the picker) */
  portalClassName?: string;
  className?: string;
};

/**
 * The editor for a component's TSX: a status strip above a toolbar, the
 * source, and a collapsible panel beside it for the component's inputs.
 *
 * Controlled and presentational. The host owns the source, the stored build
 * and what happens to its form when the inputs sync.
 */
export const ComponentStudio = ({
  value,
  onChange,
  readOnly = false,
  colorScheme,
  build,
  onCheck,
  onSyncInputs,
  catalog,
  sidePanel,
  sidePanelTitle = 'Inputs',
  defaultPanelOpen = true,
  modelPath,
  portalClassName,
  className
}: ComponentStudioProps) => {
  // Two editors sharing a model also share its text and fight over the cursor
  const ownPath = `component-${useId()}`;
  const hasPanel = sidePanel !== undefined;
  const [panelOpen, setPanelOpen] = useState(defaultPanelOpen);
  const [pickerOpen, setPickerOpen] = useState(false);

  const studio = useStudio({
    onCheck,
    onSyncInputs,
    readOnly,
    build,
    openPicker: useCallback(() => setPickerOpen(true), []),
    togglePanel: useCallback(() => {
      if (hasPanel) {
        setPanelOpen((open) => !open);
      }
    }, [hasPanel])
  });

  // Key bindings are registered once, so they reach the commands by ref
  const run = useRef(studio.run);
  run.current = studio.run;
  const { attach, handle } = studio;

  const onMount = useCallback<OnMount>(
    (editor, monaco) => {
      attach(editor, monaco);
      for (const { id, shortcut } of boundCommands()) {
        editor.addCommand(toKeybinding(monaco, shortcut), () =>
          run.current[id]()
        );
      }
    },
    [attach]
  );

  const focusEditor = useCallback(
    () => handle.current?.editor.focus(),
    [handle]
  );

  const model = stripModel(
    build,
    studio.busy ? { kind: 'busy', task: studio.busy } : studio.last
  );
  const menus = buildMenus({
    busy: studio.busy,
    readOnly,
    canSync: onSyncInputs !== undefined,
    hasPanel,
    panelOpen,
    panelTitle: sidePanelTitle
  });

  return (
    <div
      data-slot="component-studio"
      data-color-scheme={colorScheme}
      className={cn('twp flex flex-col gap-3', className)}
    >
      <StatusStrip
        model={model}
        busy={studio.busy !== null}
        findings={studio.findings}
        checked={studio.checked}
        onReveal={(line, column) => {
          const current = handle.current;
          if (current) {
            revealPosition(current.editor, line, column);
          }
        }}
      />

      <div className="@container">
        <div className="flex flex-col gap-3 @2xl:flex-row @2xl:items-start">
          <div className="min-w-0 flex-1 overflow-hidden rounded-lg border">
            <StudioToolbar
              groups={menus.filter(({ id }) => id !== 'view')}
              onRun={(id) => run.current[id]()}
              panel={
                hasPanel ? { open: panelOpen, title: sidePanelTitle } : null
              }
            />
            <SourceEditor
              value={value}
              onChange={onChange}
              readOnly={readOnly}
              colorScheme={colorScheme}
              modelPath={modelPath ?? ownPath}
              onMount={onMount}
            />
          </div>

          {hasPanel && panelOpen && (
            <aside
              aria-label={sidePanelTitle}
              className="bg-card flex shrink-0 flex-col rounded-lg border @2xl:max-h-160 @2xl:w-72"
            >
              <div className="bg-muted/40 flex items-center justify-between rounded-t-lg border-b py-1.5 pr-2 pl-3">
                <h2 className="m-0 text-sm font-medium">{sidePanelTitle}</h2>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Hide ${sidePanelTitle.toLowerCase()} panel`}
                  onClick={() => setPanelOpen(false)}
                >
                  <XIcon />
                </Button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto p-3">
                {sidePanel}
              </div>
            </aside>
          )}
        </div>
      </div>

      <ImportPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        catalog={catalog}
        onPick={studio.insertImport}
        onClosed={focusEditor}
        portalClassName={portalClassName}
      />
    </div>
  );
};
