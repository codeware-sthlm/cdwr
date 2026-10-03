import { Button } from '@codeware/shared/ui/shadcn/components/button';
import { ButtonGroup } from '@codeware/shared/ui/shadcn/components/button-group';
import {
  CircleCheckIcon,
  type LucideIcon,
  Maximize2Icon,
  Minimize2Icon,
  PackagePlusIcon,
  PanelRightCloseIcon,
  PanelRightOpenIcon,
  RefreshCwIcon,
  WandSparklesIcon
} from 'lucide-react';
import { useEffect, useState } from 'react';

import { type CommandId, type MenuModel, shortcutLabel } from './menu';

type Props = {
  /** The actions, left to right, drawn as one joined row */
  groups: readonly MenuModel[];
  onRun: (id: CommandId) => void;
  /** The side panel's toggle, at the far end; absent without a panel */
  panel: { open: boolean; title: string } | null;
  fullscreen: boolean;
};

/** One entry per command; a command without an icon does not compile */
const icons = {
  format: WandSparklesIcon,
  import: PackagePlusIcon,
  check: CircleCheckIcon,
  sync: RefreshCwIcon,
  togglePanel: PanelRightOpenIcon,
  fullscreen: Maximize2Icon
} as const satisfies Record<CommandId, LucideIcon>;

/** What a button does, said in full where its label is short */
const hints = {
  format: 'Format the source with Prettier',
  import: 'Add an import from React, the site kit or a bundled package',
  check: 'Build the unsaved source and show what is wrong, without saving',
  sync: 'Fill the Inputs list from the props the code takes',
  togglePanel: 'Show or hide the inputs panel',
  fullscreen: 'Fill the window with the editor'
} as const satisfies Record<CommandId, string>;

/** Whether the keys read as a Mac's; false until mounted, so server and client agree */
const useIsMac = (): boolean => {
  const [mac, setMac] = useState(false);
  useEffect(() => {
    setMac(/Mac|iPhone|iPad/.test(navigator.platform));
  }, []);
  return mac;
};

/**
 * The header of the editor: the actions as one row of joined buttons, and
 * the side panel's and full screen's toggles at the far end.
 */
export const StudioToolbar = ({ groups, onRun, panel, fullscreen }: Props) => {
  const mac = useIsMac();

  return (
    <div className="bg-muted/40 flex flex-wrap items-center justify-between gap-2 border-b px-2 py-1.5">
      <ButtonGroup aria-label="Actions">
        {groups
          .flatMap(({ entries }) => entries)
          .map((entry) => {
            const Icon = icons[entry.id];
            return (
              <Button
                key={entry.id}
                type="button"
                variant="outline"
                size="sm"
                disabled={entry.disabled}
                title={[
                  hints[entry.id],
                  entry.shortcut && `(${shortcutLabel(entry.shortcut, mac)})`
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => onRun(entry.id)}
              >
                <Icon />
                {entry.label}
              </Button>
            );
          })}
      </ButtonGroup>
      <div className="flex items-center gap-1">
        {panel && (
          <Button
            type="button"
            variant={panel.open ? 'secondary' : 'ghost'}
            size="icon-sm"
            aria-pressed={panel.open}
            aria-label={`${panel.open ? 'Hide' : 'Show'} ${panel.title.toLowerCase()} panel`}
            title={`${panel.open ? 'Hide' : 'Show'} ${panel.title.toLowerCase()}`}
            onClick={() => onRun('togglePanel')}
          >
            {panel.open ? <PanelRightCloseIcon /> : <PanelRightOpenIcon />}
          </Button>
        )}
        <Button
          type="button"
          variant={fullscreen ? 'secondary' : 'ghost'}
          size="icon-sm"
          aria-pressed={fullscreen}
          aria-label={fullscreen ? 'Exit full screen' : 'Full screen'}
          title={fullscreen ? 'Exit full screen (Esc)' : hints.fullscreen}
          onClick={() => onRun('fullscreen')}
        >
          {fullscreen ? <Minimize2Icon /> : <Maximize2Icon />}
        </Button>
      </div>
    </div>
  );
};
