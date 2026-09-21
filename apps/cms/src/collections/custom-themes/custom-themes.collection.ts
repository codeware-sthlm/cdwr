import { slugField } from '@codeware/app-cms/ui/fields';
import { adminGroups } from '@codeware/app-cms/util/definitions';
import { customT } from '@codeware/app-cms/util/i18n';
import { hasRole } from '@codeware/app-cms/util/misc';
import {
  SITE_THEMES,
  isValidThemeSlug,
  isValidTokenName,
  isValidTokenValue
} from '@codeware/shared/theme';
import {
  brokenReferences,
  contrastFailures,
  unreadableTokens
} from '@codeware/shared/util/color';
import type {
  CollectionConfig,
  PayloadRequest,
  TextField,
  Validate
} from 'payload';

import { userOnlyAccess } from '../../security/user-only-access';
import { userOrApiKeyAccess } from '../../security/user-or-api-key-access';

import { restrictedFontsIn } from './restricted-fonts';

/** Reuses the slug field's per-tenant uniqueness and dash formatting. */
const base = slugField({ sourceField: 'name', required: true }) as TextField;

/**
 * The theme's `data-theme` value.
 *
 * A slug rather than a free-text name because it goes straight into a CSS
 * selector, and it has to survive alongside the built-in themes in the same
 * attribute.
 */
const themeSlugField: TextField = {
  ...base,
  label: { en: 'Theme id', sv: 'Tema-id' },
  admin: {
    ...base.admin,
    description: {
      en: 'Identifies the theme in the page markup. Generated from the name if left empty.',
      sv: 'Identifierar temat i sidans markup. Genereras från namnet om det lämnas tomt.'
    }
  },
  validate: ((value, { req }) => {
    if (!value) {
      // `required` already reports this
      return true;
    }
    if ((SITE_THEMES as readonly string[]).includes(value)) {
      return customT((req as PayloadRequest).t)('validation:themeNameBuiltIn', {
        name: value
      });
    }
    if (!isValidThemeSlug(value)) {
      // `light` and `dark` would be indistinguishable from the colour scheme
      return ['light', 'dark'].includes(value)
        ? customT((req as PayloadRequest).t)('validation:themeNameReserved', {
            name: value
          })
        : customT((req as PayloadRequest).t)('validation:themeNameInvalid');
    }
    return true;
  }) as Validate
};

/**
 * Reject anything that could not be written into a stylesheet.
 *
 * The site injects these tokens into a `<style>` block, so the same whitelist
 * that guards the render guards the save — here it can say what was wrong
 * instead of silently dropping the token.
 */
/** Payload types a `json` field as anything JSON can hold. */
const asTokens = (value: unknown): Record<string, string> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, string>)
    : {};

const validateTokens =
  (scheme: 'light' | 'dark'): Validate =>
  (value, { siblingData }) => {
    if (value === null || value === undefined || value === '') {
      return scheme === 'light' ? 'Light tokens are required.' : true;
    }
    if (typeof value !== 'object' || Array.isArray(value)) {
      return 'Expected an object of token names and values.';
    }

    const rejected = Object.entries(value as Record<string, unknown>)
      .filter(
        ([name, token]) => !isValidTokenName(name) || !isValidTokenValue(token)
      )
      .map(([name]) => name);

    if (rejected.length) {
      return `Not usable as CSS: ${rejected.join(', ')}. Names look like "--core-link"; values may only hold colours, lengths and var()/calc()/color-mix() references.`;
    }

    // The whitelist above only judges characters, so `var(--backgroundx)` sails
    // through it as well-formed CSS and then resolves to nothing at all. Dark
    // is checked merged over light, since a dark token may alias one only light
    // defines — which is exactly what the browser cascades to.
    const sibling = siblingData as Record<string, unknown> | undefined;
    const light = asTokens(
      scheme === 'light' ? value : sibling?.['tokensLight']
    );
    const tokens =
      scheme === 'light' ? light : { ...light, ...asTokens(value) };

    const broken = brokenReferences(tokens).filter(
      ({ token }) => token in asTokens(value)
    );

    if (broken.length) {
      return `These aliases lead nowhere: ${broken
        .map(({ token, reference }) => `${token} → ${reference}`)
        .join(', ')}.`;
    }

    // The checks above prove every token resolves to something; this one asks
    // whether what it resolves to can be read. It lives here rather than only
    // in the studio because the studio is a disabled button, and a write
    // through the API never meets it — and "an inaccessible theme cannot be
    // published here" is a promise the platform makes to people who are
    // legally obliged to keep it.
    // A value the check cannot read makes the pair vanish rather than fail, so
    // a theme written in `hsl()` or `color-mix()` would pass by being
    // unmeasurable. Refuse what cannot be verified before judging what can
    const unreadable = unreadableTokens(tokens).filter(
      ({ token }) => token in asTokens(value)
    );

    if (unreadable.length) {
      return `These hold colours the contrast check cannot read, so it cannot be applied: ${unreadable
        .map(({ token, value: held }) => `${token} (${held})`)
        .join(', ')}. Use an oklch() or hex value.`;
    }

    const failures = contrastFailures(tokens);

    if (failures.length) {
      return `These fall below the contrast they need: ${failures
        .map(
          ({ usage, ratio, minimum }) =>
            `${usage} at ${ratio.toFixed(2)}:1, needs ${minimum}:1`
        )
        .join('; ')}.`;
    }

    return true;
  };

/**
 * Custom themes collection
 *
 * Tenant-authored token sets, injected into the site at runtime as a scoped
 * `<style>` block rather than compiled into the CSS bundle. That is what lets a
 * theme ship without a build or a deploy.
 */
const customThemes: CollectionConfig = {
  slug: 'custom-themes',
  admin: {
    group: adminGroups.settings,
    defaultColumns: ['name', 'slug', 'recipe', 'overrides'],
    useAsTitle: 'name',
    description: {
      en: 'Your own themes. Select them in Site Settings to make them available on the site.',
      sv: 'Dina egna teman. Välj dem i Webbplatsinställningar för att göra dem tillgängliga på webbplatsen.'
    }
  },
  access: {
    read: userOrApiKeyAccess(),
    create: userOnlyAccess(),
    update: userOnlyAccess(),
    delete: userOnlyAccess()
  },
  labels: {
    singular: { en: 'Custom theme', sv: 'Eget tema' },
    plural: { en: 'Custom themes', sv: 'Egna teman' }
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
      label: { en: 'Name', sv: 'Namn' },
      admin: {
        description: {
          en: 'Shown to visitors in the theme selector.',
          sv: 'Visas för besökare i temaväljaren.'
        }
      }
    },
    {
      name: 'recipe',
      type: 'json',
      label: { en: 'Theme', sv: 'Tema' },
      // Hiding the control in the studio is not the control: `recipe` is a JSON
      // column and can be set through the API. This is the half that holds.
      validate: ((value, { req }) => {
        const refused = restrictedFontsIn(value);

        if (!refused.length || hasRole(req.user, 'system-user')) {
          return true;
        }

        return customT(req.t)('validation:fontRestricted', {
          fonts: refused.join(', ')
        });
      }) as Validate,
      admin: {
        description: {
          en: 'The decisions the tokens below are generated from.',
          sv: 'De val som tokens nedan genereras från.'
        },
        components: {
          Cell: '@codeware/apps/cms/components/ThemeRecipeCell',
          Field:
            '@codeware/app-cms/ui/fields/theme-studio/ThemeStudioField.client'
        }
      }
    },
    {
      name: 'overrides',
      type: 'json',
      label: { en: 'Overrides', sv: 'Överskrivningar' },
      admin: {
        // Hidden as a *field* — the studio's fine-tuning panel is where an
        // override is shown beside the value it departs from. The list still
        // gets a cell, because whether a theme departs from its recipe is the
        // one thing about overrides worth seeing without opening it.
        hidden: true,
        components: {
          Cell: '@codeware/apps/cms/components/ThemeOverridesCell'
        }
      }
    },
    {
      name: 'tokensLight',
      type: 'json',
      required: true,
      label: { en: 'Light tokens', sv: 'Ljusa tokens' },
      admin: {
        description: {
          en: 'Generated by the studio. Editing by hand leaves the theme above out of step.',
          sv: 'Genereras av studion. Redigering för hand gör att temat ovan inte längre stämmer.'
        }
      },
      validate: validateTokens('light')
    },
    {
      name: 'tokensDark',
      type: 'json',
      label: { en: 'Dark tokens', sv: 'Mörka tokens' },
      admin: {
        description: {
          en: 'Only the properties that change in dark. The rest cascade from the light set.',
          sv: 'Bara de variabler som ändras i mörkt läge. Övriga ärvs från den ljusa uppsättningen.'
        }
      },
      validate: validateTokens('dark')
    },
    themeSlugField
  ]
};

export default customThemes;
