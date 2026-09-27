'use client';

import { hasRole } from '@codeware/app-cms/util/misc';
import {
  ThemeStudio,
  type ThemeStudioResult
} from '@codeware/shared/ui/theme-studio';
import { type ThemeTokens, normaliseRecipe } from '@codeware/shared/util/color';
import type { User } from '@codeware/shared/util/payload-types';
import { Button, FieldLabel, useAuth, useField } from '@payloadcms/ui';
import type { JSONFieldClientProps } from 'payload';
import { useState } from 'react';
import { createPortal } from 'react-dom';

type Overrides = { light: ThemeTokens; dark: ThemeTokens };

const NO_OVERRIDES: Overrides = { light: {}, dark: {} };

/** Whether anything was stored at all — the shape itself is normalised below. */
const hasRecipe = (value: unknown): boolean =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

const asOverrides = (value: unknown): Overrides =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? { ...NO_OVERRIDES, ...(value as Partial<Overrides>) }
    : NO_OVERRIDES;

/**
 * Opens the theme studio and writes back everything it produces.
 *
 * The recipe is stored alongside the tokens rather than derived from them: a
 * token map cannot be reversed into the four decisions that made it, so
 * without it a theme could be edited once and never reopened where it was left.
 *
 * Sits on the `recipe` field and writes to `tokensLight`, `tokensDark` and
 * `overrides` beside it — those are what the site renders, so the studio owns
 * all four together or none of them.
 */
export const ThemeStudioField: React.FC<
  JSONFieldClientProps & { fontAssetsBaseUrl?: string }
> = ({ field, path, readOnly, fontAssetsBaseUrl }) => {
  const { value, setValue } = useField<unknown>({ path });
  const { setValue: setOverrides, value: overridesValue } = useField<unknown>({
    path: 'overrides'
  });
  const { setValue: setLight } = useField<unknown>({ path: 'tokensLight' });
  const { setValue: setDark } = useField<unknown>({ path: 'tokensDark' });

  const { user } = useAuth<User>();
  const [open, setOpen] = useState(false);

  // Exporting produces committed theme files that ship to every tenant, so it
  // is a platform action rather than one about this workspace's own site
  // One role, two capabilities: exporting ships files to every tenant, and a
  // licensed face may only be embedded on a site Codeware owns. Neither is a
  // tenant admin's to reach.
  const isSystemUser = hasRole(user ?? null, 'system-user');

  // A theme saved before a recipe field existed is missing it; normalising
  // fills each gap on its own rather than opening the studio on nothing
  const stored = hasRecipe(value);
  const recipe = normaliseRecipe(value);

  const onSelect = ({
    recipe: chosen,
    overrides,
    tokensLight,
    tokensDark
  }: ThemeStudioResult) => {
    setValue(chosen);
    setOverrides(overrides);
    setLight(tokensLight);
    setDark(tokensDark);
    setOpen(false);
  };

  return (
    <div className="field-type">
      <FieldLabel label={field.label} />

      <div className="mt-2.5 flex items-center gap-3">
        <Button
          buttonStyle="subtle"
          size="medium"
          onClick={() => setOpen(true)}
          disabled={readOnly}
        >
          {stored ? 'Edit in theme studio' : 'Open theme studio'}
        </Button>

        {stored && (
          <span className="twp text-muted-foreground text-xs">
            {recipe.brandFamily} on {recipe.baseFamily}, {recipe.surface}
          </span>
        )}
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
              canExport={isSystemUser}
              canUseRestrictedFonts={isSystemUser}
              fontAssetsBaseUrl={fontAssetsBaseUrl}
              recipe={recipe}
              overrides={asOverrides(overridesValue)}
              onSelect={onSelect}
              onClose={() => setOpen(false)}
            />
          </div>,
          document.body
        )}
    </div>
  );
};

export default ThemeStudioField;
