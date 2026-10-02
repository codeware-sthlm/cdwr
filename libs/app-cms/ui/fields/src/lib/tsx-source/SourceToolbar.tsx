'use client';

import type {
  TranslationsKeys,
  TranslationsObject
} from '@codeware/app-cms/util/i18n';
import { Button } from '@codeware/shared/ui/shadcn/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger
} from '@codeware/shared/ui/shadcn/components/dropdown-menu';
import { cn } from '@codeware/shared/util/ui';
import { useTranslation } from '@payloadcms/ui';
import React, { useCallback, useState } from 'react';

import { type ImportGroup, importGroups, importLabel } from './import-catalog';
import type { ImportRequest } from './insert-import';
import { loadKitNames } from './kit-names';
import type { SourceTools } from './use-source-tools';

/** The toolbar's entries; a new one is a new member and a new render case. */
type ToolbarAction =
  | {
      kind: 'button';
      id: 'format' | 'check' | 'syncProps';
      label: string;
      busy: boolean;
      disabled: boolean;
      onSelect: () => void;
    }
  | {
      kind: 'imports';
      id: 'insertImport';
      label: string;
      disabled: boolean;
      onInsert: (request: ImportRequest) => void;
    };

type KitNames =
  | { status: 'idle' | 'loading' | 'failed' }
  | { status: 'ready'; names: string[] };

const groupTitles = {
  react: () => 'react',
  '@site/ui': () => '@site/ui',
  bundled: (t: (key: TranslationsKeys) => string) =>
    t('customComponents:importsBundled')
} as const satisfies Record<
  ImportGroup['source'],
  (t: (key: TranslationsKeys) => string) => string
>;

const MENU_CLASS = 'codeware-admin twp max-h-80 w-auto min-w-44';

const ImportMenu: React.FC<{
  action: Extract<ToolbarAction, { kind: 'imports' }>;
}> = ({ action }) => {
  const { t } = useTranslation<TranslationsObject, TranslationsKeys>();
  const [kit, setKit] = useState<KitNames>({ status: 'idle' });

  // The kit is read when the menu first opens, so it stays out of the admin's
  // first load
  const onOpenChange = useCallback(
    (open: boolean) => {
      if (!open || kit.status === 'loading' || kit.status === 'ready') {
        return;
      }
      setKit({ status: 'loading' });
      loadKitNames().then(
        (names) => setKit({ status: 'ready', names }),
        () => setKit({ status: 'failed' })
      );
    },
    [kit.status]
  );

  const groups = importGroups(kit.status === 'ready' ? kit.names : []);

  return (
    <DropdownMenu onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={action.disabled}
        >
          {action.label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className={MENU_CLASS}>
        {groups.map((group) => (
          <DropdownMenuSub key={group.source}>
            <DropdownMenuSubTrigger>
              {groupTitles[group.source](t)}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className={MENU_CLASS}>
              {group.source === '@site/ui' && kit.status !== 'ready' ? (
                <DropdownMenuItem disabled>
                  {t(
                    kit.status === 'failed'
                      ? 'customComponents:importsKitFailed'
                      : 'customComponents:importsLoading'
                  )}
                </DropdownMenuItem>
              ) : (
                group.entries.map((entry) => (
                  <DropdownMenuItem
                    key={`${entry.module}:${entry.name ?? ''}`}
                    onSelect={() => action.onInsert(entry)}
                  >
                    {importLabel(entry)}
                  </DropdownMenuItem>
                ))
              )}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

/**
 * The tools above the source editor: format, insert an import, check the
 * unsaved source and sync the declared props from the code.
 */
const SourceToolbar: React.FC<{ tools: SourceTools }> = ({ tools }) => {
  const { t } = useTranslation<TranslationsObject, TranslationsKeys>();
  const working = tools.busy !== null;

  const actions: ToolbarAction[] = [
    {
      kind: 'button',
      id: 'format',
      label: t('customComponents:formatSource'),
      busy: false,
      disabled: false,
      onSelect: tools.format
    },
    {
      kind: 'imports',
      id: 'insertImport',
      label: t('customComponents:insertImport'),
      disabled: false,
      onInsert: tools.insertImport
    },
    {
      kind: 'button',
      id: 'check',
      label: t(
        tools.busy === 'check'
          ? 'customComponents:checking'
          : 'customComponents:checkSource'
      ),
      busy: tools.busy === 'check',
      disabled: working,
      onSelect: tools.check
    },
    {
      kind: 'button',
      id: 'syncProps',
      label: t(
        tools.busy === 'sync'
          ? 'customComponents:checking'
          : 'customComponents:syncProps'
      ),
      busy: tools.busy === 'sync',
      disabled: working,
      onSelect: tools.syncProps
    }
  ];

  return (
    <div className="twp mb-2 flex flex-col gap-2 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        {actions.map((action) =>
          action.kind === 'imports' ? (
            <ImportMenu key={action.id} action={action} />
          ) : (
            <Button
              key={action.id}
              type="button"
              variant="outline"
              size="sm"
              disabled={action.disabled}
              aria-busy={action.busy}
              onClick={action.onSelect}
            >
              {action.label}
            </Button>
          )
        )}
        {tools.notice && (
          <span
            role="status"
            className={cn(
              tools.notice.tone === 'error' && 'text-destructive',
              tools.notice.tone === 'warn' && 'text-(--warning-subtle)',
              (tools.notice.tone === 'muted' || tools.notice.tone === 'ok') &&
                'text-muted-foreground'
            )}
          >
            {tools.notice.text}
          </span>
        )}
      </div>
      {tools.unlocated.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-1 p-0 font-mono">
          {tools.unlocated.map((finding, index) => (
            <li
              key={`${finding.severity}:${index}`}
              className={cn(
                'whitespace-pre-wrap',
                finding.severity === 'error'
                  ? 'text-destructive'
                  : 'text-(--warning-subtle)'
              )}
            >
              {finding.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default SourceToolbar;
