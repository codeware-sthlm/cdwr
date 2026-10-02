import { Button } from '@codeware/shared/ui/shadcn/components/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList
} from '@codeware/shared/ui/shadcn/components/command';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@codeware/shared/ui/shadcn/components/dialog';
import { cn } from '@codeware/shared/util/ui';
import { LoaderCircleIcon } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  type ImportCatalog,
  type KitState,
  filterGroups,
  importGroups,
  importHint,
  importLabel
} from './catalog';
import type { ImportRequest } from './insert-import';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  catalog: ImportCatalog;
  onPick: (request: ImportRequest) => void;
  /** Called once the dialog has closed, to give the editor its focus back */
  onClosed: () => void;
  portalClassName?: string;
};

/** The kit's names, read the first time the picker opens and again on retry */
const useKitNames = (
  load: ImportCatalog['loadKitNames'],
  wanted: boolean
): { kit: KitState; retry: () => void } => {
  const [kit, setKit] = useState<KitState>({ status: 'idle' });
  const loading = useRef(false);

  const start = useCallback(() => {
    if (loading.current) {
      return;
    }
    loading.current = true;
    setKit({ status: 'loading' });
    load().then(
      (names) => {
        loading.current = false;
        setKit({ status: 'ready', names });
      },
      () => {
        loading.current = false;
        setKit({ status: 'failed' });
      }
    );
  }, [load]);

  useEffect(() => {
    if (wanted && kit.status === 'idle') {
      start();
    }
  }, [kit.status, start, wanted]);

  return { kit, retry: start };
};

/**
 * Pick what to import: searchable, grouped, scrolling. Closes on a pick, so
 * each insert is one deliberate step and focus returns to the editor.
 */
export const ImportPicker = ({
  open,
  onOpenChange,
  catalog,
  onPick,
  onClosed,
  portalClassName
}: Props) => {
  const [query, setQuery] = useState('');
  const { kit, retry } = useKitNames(catalog.loadKitNames, open);

  const groups = useMemo(
    () =>
      filterGroups(
        importGroups(
          { reactHooks: catalog.reactHooks, packages: catalog.packages },
          kit
        ),
        query
      ),
    [catalog.packages, catalog.reactHooks, kit, query]
  );

  const pick = (request: ImportRequest) => {
    onPick(request);
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setQuery('');
        }
        onOpenChange(next);
      }}
    >
      <DialogContent
        showCloseButton={false}
        className={cn(
          'twp top-1/3 translate-y-0 gap-0 p-0 sm:max-w-md',
          portalClassName
        )}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          onClosed();
        }}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>Insert import</DialogTitle>
          <DialogDescription>
            Search for a hook, a kit component or a package to import.
          </DialogDescription>
        </DialogHeader>
        <Command shouldFilter={false} className="rounded-xl!">
          <CommandInput
            placeholder="Search imports"
            value={query}
            onValueChange={setQuery}
          />
          <CommandList className="max-h-80">
            <CommandEmpty>Nothing matches “{query}”.</CommandEmpty>
            {groups
              .filter(
                (group) =>
                  group.entries.length > 0 ||
                  (group.id === '@site/ui' && kit.status !== 'ready')
              )
              .map((group) => (
                <CommandGroup key={group.id} heading={group.title}>
                  {group.id === '@site/ui' && kit.status !== 'ready' && (
                    <KitStatus kit={kit} retry={retry} />
                  )}
                  {group.entries.map((entry) => (
                    <CommandItem
                      key={`${entry.module}:${entry.name ?? ''}`}
                      value={`${entry.module}:${entry.name ?? ''}`}
                      onSelect={() => pick(entry)}
                    >
                      {/* Two columns, so every hint starts on the same line */}
                      <span className="grid min-w-0 flex-1 grid-cols-[minmax(0,11rem)_minmax(0,1fr)] items-baseline gap-3">
                        <span className="truncate">{importLabel(entry)}</span>
                        <span className="text-muted-foreground truncate font-mono text-xs">
                          {importHint(entry)}
                        </span>
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
};

const KitStatus = ({
  kit,
  retry
}: {
  kit: Exclude<KitState, { status: 'ready' }>;
  retry: () => void;
}) =>
  kit.status === 'failed' ? (
    <div className="flex items-center gap-2 px-2 py-1.5 text-sm">
      <span className="text-(--destructive-subtle)">
        The site kit could not be loaded.
      </span>
      <Button type="button" variant="outline" size="xs" onClick={retry}>
        Retry
      </Button>
    </div>
  ) : (
    <div className="text-muted-foreground flex items-center gap-2 px-2 py-1.5 text-sm">
      <LoaderCircleIcon className="size-4 animate-spin" />
      Loading the site kit…
    </div>
  );
