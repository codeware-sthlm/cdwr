'use client';

import { Button } from '@codeware/shared/ui/shadcn/components/button';
import { cn } from '@codeware/shared/util/ui';
import type { OnMount } from '@monaco-editor/react';
import { XIcon } from 'lucide-react';
import {
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState
} from 'react';

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
  /** Added to the panel, e.g. to widen it */
  panelClassName?: string;
  defaultPanelOpen?: boolean;
  /** Starts as an overlay covering the window */
  defaultFullscreen?: boolean;
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
  panelClassName,
  defaultPanelOpen = true,
  defaultFullscreen = false,
  modelPath,
  portalClassName,
  className
}: ComponentStudioProps) => {
  // Two editors sharing a model also share its text and fight over the cursor
  const ownPath = `component-${useId()}`;
  const hasPanel = sidePanel !== undefined;
  const [panelOpen, setPanelOpen] = useState(defaultPanelOpen);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(defaultFullscreen);

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
    }, [hasPanel]),
    toggleFullscreen: useCallback(() => setFullscreen((on) => !on), [])
  });

  // Key bindings are registered once, so they reach the commands by ref
  const run = useRef(studio.run);
  run.current = studio.run;
  const { attach, handle } = studio;

  // Escape belongs to the editor's own widgets first, so the binding only
  // applies while full screen is on and none of them is open
  const fullscreenKey = useRef<{ set: (on: boolean) => void } | null>(null);
  const fullscreenNow = useRef(fullscreen);
  fullscreenNow.current = fullscreen;

  const onMount = useCallback<OnMount>(
    (editor, monaco) => {
      attach(editor, monaco);
      fullscreenKey.current = editor.createContextKey(
        'studioFullscreen',
        fullscreenNow.current
      );
      editor.addCommand(
        monaco.KeyCode.Escape,
        () => setFullscreen(false),
        'studioFullscreen && !suggestWidgetVisible && !findWidgetVisible && !parameterHintsVisible && !editorHasMultipleSelections'
      );
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

  useEffect(() => {
    fullscreenKey.current?.set(fullscreen);
  }, [fullscreen]);

  // Entering or leaving hands the keyboard back to the editor
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    focusEditor();
  }, [fullscreen, focusEditor]);

  // The page behind must not scroll under the overlay
  useEffect(() => {
    if (!fullscreen) {
      return;
    }
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = overflow;
    };
  }, [fullscreen]);

  // For when the editor is not focused; the picker's dialog has already
  // claimed its own Escape by the time it bubbles up to the document
  useEffect(() => {
    if (!fullscreen || pickerOpen) {
      return;
    }
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) {
        setFullscreen(false);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [fullscreen, pickerOpen]);

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
    panelTitle: sidePanelTitle,
    fullscreen
  });

  return (
    <div
      data-slot="component-studio"
      data-color-scheme={colorScheme}
      className={cn(
        'twp flex flex-col gap-3',
        // Above Payload's nav, modals and status bar (20-40), below the
        // dialogs and popovers that portal out of the studio (50, 60)
        fullscreen &&
          'bg-background text-foreground fixed inset-0 z-45 overflow-hidden p-4',
        className
      )}
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

      <div className={cn('@container', fullscreen && 'min-h-0 flex-1')}>
        <div
          className={cn(
            'flex flex-col gap-3 @2xl:flex-row',
            fullscreen ? 'h-full' : '@2xl:items-start'
          )}
        >
          <div
            className={cn(
              'flex min-w-0 flex-1 flex-col overflow-hidden rounded-lg border',
              fullscreen && 'min-h-0'
            )}
          >
            <StudioToolbar
              groups={menus.filter(({ id }) => id !== 'view')}
              onRun={(id) => {
                run.current[id]();
                // The click left the keyboard on the button. Import's dialog
                // takes it itself and gives it back on close; full screen
                // gives it back once the layout has changed
                if (id !== 'import' && id !== 'fullscreen') {
                  focusEditor();
                }
              }}
              panel={
                hasPanel ? { open: panelOpen, title: sidePanelTitle } : null
              }
              fullscreen={fullscreen}
            />
            <div className={cn(fullscreen && 'min-h-0 flex-1')}>
              <SourceEditor
                value={value}
                onChange={onChange}
                readOnly={readOnly}
                colorScheme={colorScheme}
                modelPath={modelPath ?? ownPath}
                onMount={onMount}
                fill={fullscreen}
              />
            </div>
          </div>

          {hasPanel && panelOpen && (
            <aside
              aria-label={sidePanelTitle}
              className={cn(
                'bg-card flex shrink-0 flex-col rounded-lg border @2xl:w-72',
                fullscreen ? 'max-h-1/2 @2xl:max-h-none' : '@2xl:max-h-160',
                panelClassName
              )}
            >
              <div className="bg-muted/40 flex items-center justify-between rounded-t-lg border-b py-1.5 pr-2 pl-3">
                <h2 className="m-0 text-sm font-medium">{sidePanelTitle}</h2>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Hide ${sidePanelTitle.toLowerCase()} panel`}
                  onClick={() => {
                    setPanelOpen(false);
                    focusEditor();
                  }}
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
