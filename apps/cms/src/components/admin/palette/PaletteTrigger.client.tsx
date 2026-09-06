'use client';

import type {
  TranslationsKeys,
  TranslationsObject
} from '@codeware/app-cms/util/i18n';
import { Button } from '@codeware/shared/ui/shadcn/components/button';
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import { useTranslation } from '@payloadcms/ui';
import React from 'react';

import { paletteShortcutLabel } from './palette-shortcut-label';
import { PaletteDialogHost } from './PaletteDialog.client';
import { usePalette } from './PaletteProvider.client';

/**
 * Toolbar trigger for the command palette (`admin.components.actions`),
 * mirroring the theme switch pill.
 *
 * Also mounts the palette dialog itself: actions render inside Payload's
 * default template where per-user contexts (entity visibility, tenant
 * selection) exist, unlike the globally mounted `PaletteProvider`.
 */
export function PaletteTrigger() {
  const { openPalette } = usePalette();
  const { t } = useTranslation<TranslationsObject, TranslationsKeys>();

  return (
    <div className="codeware-admin twp">
      {/* Same pill as the language/locale actions — `outline` resolves to a
       * different surface in dark mode (`dark:bg-input/30`) and broke the row's
       * visual rhythm. Labels collapse at `lg`, not `sm`: Payload clamps its
       * actions row and scroll-fades the overflow, which the labelled pills
       * blew past on medium viewports. */}
      <Button
        onClick={openPalette}
        variant="toolbar"
        size="sm"
        title={t('palette:openPalette')}
        aria-label={t('palette:dialogTitle')}
      >
        <MagnifyingGlassIcon className="size-3.5" />
        <span className="max-lg:hidden">{t('palette:openPalette')}</span>
        <kbd className="border-border bg-muted text-muted-foreground rounded border px-1 py-px font-sans text-[10px] max-lg:hidden">
          {paletteShortcutLabel()}
        </kbd>
      </Button>
      <PaletteDialogHost />
    </div>
  );
}

export default PaletteTrigger;
