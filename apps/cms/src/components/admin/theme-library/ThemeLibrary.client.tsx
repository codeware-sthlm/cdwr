'use client';

import type {
  TranslationsKeys,
  TranslationsObject
} from '@codeware/app-cms/util/i18n';
import {
  Alert,
  AlertDescription,
  AlertTitle
} from '@codeware/shared/ui/shadcn/components/alert';
import { Badge } from '@codeware/shared/ui/shadcn/components/badge';
import { Button } from '@codeware/shared/ui/shadcn/components/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from '@codeware/shared/ui/shadcn/components/card';
import {
  ThemeStudio,
  type ThemeStudioResult
} from '@codeware/shared/ui/theme-studio';
import type { ThemeRecipe, ThemeTokens } from '@codeware/shared/util/color';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';
import { useTranslation } from '@payloadcms/ui';
import { PaletteIcon, TriangleAlertIcon } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { createPortal } from 'react-dom';

export type BuiltInTheme = {
  name: string;
  label: string;
  recipe: ThemeRecipe;
  /** What the studio opens with: the recipe's gaps plus the theme's own tokens */
  overrides: { light: ThemeTokens; dark: ThemeTokens };
  /** The theme's resolved primary colour, for the swatch */
  primary: string;
  counts: {
    fineTuned: number;
    extra: number;
    notPortable: number;
    issues: number;
  };
};

/**
 * Open a platform theme in the studio, and fork it into a theme of your own.
 *
 * Forking rather than saving: these files ship in the CSS bundle to every
 * tenant, and nothing here writes to them. What it produces is an ordinary
 * custom theme, which is a row and belongs to this site.
 */
export function ThemeLibrary({
  themes,
  fontAssetsBaseUrl,
  grantedFonts
}: {
  themes: Array<BuiltInTheme>;
  /** Where self-hosted faces are served from, so the studio can draw them */
  fontAssetsBaseUrl?: string;
  /** The licensed faces this deployment may embed */
  grantedFonts?: string;
}) {
  const { t } = useTranslation<TranslationsObject, TranslationsKeys>();
  const [open, setOpen] = useState<BuiltInTheme | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fork = async (source: BuiltInTheme, result: ThemeStudioResult) => {
    setSaving(true);
    setError(null);

    try {
      const response = await fetch('/api/custom-themes', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // Stored on the row, so it is named in the language of whoever forked
          name: t('themeLibrary:forkName', { label: source.label }),
          recipe: result.recipe,
          overrides: result.overrides,
          tokensLight: result.tokensLight,
          tokensDark: result.tokensDark
        })
      });

      if (!response.ok) {
        // The collection validates fonts, token names and dangling aliases, and
        // its message says which — worth showing rather than a status code
        const body = await response.json().catch(() => null);
        throw new Error(
          body?.errors?.[0]?.message ??
            t('themeLibrary:couldNotSaveStatus', { status: response.status })
        );
      }

      const { doc } = await response.json();
      window.location.href = `/admin/collections/custom-themes/${doc.id}`;
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : t('themeLibrary:couldNotSave')
      );
      setSaving(false);
    }
  };

  return (
    <div className="twp mx-auto max-w-5xl p-8">
      <header className="mb-6">
        {/* The view has no breadcrumb of its own — it is not a collection, so
            Payload renders no trail above it and the sidebar is the only way
            back out */}
        <Button
          variant="ghost"
          size="sm"
          asChild
          className="text-muted-foreground mb-2 -ml-2 h-7"
        >
          <Link href="/admin">
            <ArrowLeftIcon className="size-4" />
            {t('nav:home')}
          </Link>
        </Button>

        {/* The palette the sidebar uses, and the same one the site's own theme
            switcher shows a visitor — one drawing for one idea */}
        <h1 className="flex items-center gap-2 text-xl font-semibold">
          <PaletteIcon className="size-5" />
          {t('themeLibrary:title')}
        </h1>
        {/* The bold word is the one on the studio's confirm button */}
        <p className="text-muted-foreground mt-1 text-sm">
          {t('themeLibrary:introBefore')}{' '}
          <strong className="font-medium">
            {t('themeLibrary:forkAction')}
          </strong>{' '}
          {t('themeLibrary:introAfter')}
        </p>
      </header>

      {error && (
        <Alert variant="destructive" className="mb-6">
          <TriangleAlertIcon className="size-4" />
          <AlertTitle>{t('themeLibrary:forkFailed')}</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {themes.map((theme) => (
          <Card key={theme.name} className="flex flex-col">
            <CardHeader>
              <CardTitle className="flex items-center justify-between gap-2">
                {theme.label}
                <span
                  role="img"
                  aria-label={t('themeLibrary:primaryColour', {
                    colour: theme.primary
                  })}
                  title={t('themeLibrary:primaryColourTitle', {
                    colour: theme.primary
                  })}
                  className="border-border size-5 shrink-0 rounded-full border"
                  style={{ background: theme.primary }}
                />
              </CardTitle>
              <CardDescription>
                {t('themeLibrary:cardDescription', {
                  brand: theme.recipe.brandFamily,
                  base: theme.recipe.baseFamily,
                  surface: theme.recipe.surface
                })}
              </CardDescription>
            </CardHeader>

            <CardContent className="flex-1">
              {/* Native `title` rather than a tooltip: a count alone says
                    nothing, and these cards are not worth a client bundle */}
              <div className="flex flex-wrap gap-1.5">
                <Badge
                  variant="secondary"
                  title={t('themeLibrary:fineTunedTitle')}
                >
                  {t('themeLibrary:fineTuned', {
                    count: theme.counts.fineTuned
                  })}
                </Badge>
                {theme.counts.extra > 0 && (
                  <Badge
                    variant="secondary"
                    title={t('themeLibrary:extraTitle')}
                  >
                    {t('themeLibrary:extra', { count: theme.counts.extra })}
                  </Badge>
                )}
                {theme.counts.notPortable > 0 && (
                  <Badge
                    variant="destructive"
                    title={t('themeLibrary:notPortableTitle')}
                  >
                    {t('themeLibrary:notPortable', {
                      count: theme.counts.notPortable
                    })}
                  </Badge>
                )}
                {theme.counts.issues > 0 && (
                  <Badge
                    variant="destructive"
                    title={t('themeLibrary:issuesTitle')}
                  >
                    <TriangleAlertIcon className="size-3" />
                    {theme.counts.issues === 1
                      ? t('themeLibrary:issuesOne')
                      : t('themeLibrary:issues', {
                          count: theme.counts.issues
                        })}
                  </Badge>
                )}
              </div>

              {theme.counts.notPortable > 0 && (
                // The badge names the problem; this says what it costs, which
                // is the part worth seeing without hovering anything
                <p className="text-muted-foreground mt-3 text-xs">
                  {t('themeLibrary:notPortableNote')}
                </p>
              )}
            </CardContent>

            <CardFooter>
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => setOpen(theme)}
                disabled={saving}
              >
                {t('themeLibrary:openInStudio')}
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>

      {open &&
        createPortal(
          <div
            className="twp"
            style={{ position: 'fixed', inset: 0, zIndex: 2147483647 }}
            onClick={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
          >
            <ThemeStudio
              // Only a system admin reaches this view at all, so both
              // capabilities are already decided by the time it renders
              canExport
              canUseRestrictedFonts
              fontAssetsBaseUrl={fontAssetsBaseUrl}
              grantedFonts={grantedFonts}
              themeName={open.label}
              // The folder, not the label — the write-back names a directory,
              // and a label is not a folder
              themeSlug={open.name}
              // The studio's confirm button writes back to whatever opened it.
              // Here that is a built-in, which is never written back to — so it
              // has to say what it really does
              selectLabel={t('themeLibrary:forkLabel', { label: open.label })}
              recipe={open.recipe}
              overrides={open.overrides}
              onSelect={(result) => fork(open, result)}
              onClose={() => setOpen(null)}
            />
          </div>,
          document.body
        )}
    </div>
  );
}

export default ThemeLibrary;
