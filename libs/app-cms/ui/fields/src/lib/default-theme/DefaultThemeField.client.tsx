'use client';

import { themeLabel } from '@codeware/shared/theme';
import type { Config } from '@codeware/shared/util/payload-types';
import { PayloadSDK } from '@payloadcms/sdk';
import {
  SelectInput,
  useAuth,
  useConfig,
  useField,
  useFormFields
} from '@payloadcms/ui';
import type { OptionObject, TextFieldClientProps } from 'payload';
import { useEffect, useMemo, useState } from 'react';

/** The relationship holds ids, or whole documents once Payload has populated them. */
const toId = (entry: unknown): number | null => {
  if (typeof entry === 'number') {
    return entry;
  }
  if (entry && typeof entry === 'object' && 'id' in entry) {
    return (entry as { id: number }).id;
  }
  return null;
};

/**
 * Picks the theme a visitor sees first, across both kinds of theme.
 *
 * A plain `select` cannot do this: its options are fixed when the config is
 * built, and an authored theme does not exist until a tenant creates one. So
 * the stored value is text, and the options are assembled here from the
 * built-in themes already chosen plus the authored ones selected beside them.
 *
 * The names of the authored themes are not in the form state — the
 * relationship carries ids — so they are fetched. Access control scopes that
 * to the tenant.
 */
export const DefaultThemeField: React.FC<TextFieldClientProps> = ({
  field,
  path,
  readOnly
}) => {
  const { value, setValue, showError, errorMessage } = useField<string>({
    path
  });
  const { token } = useAuth();
  const { config } = useConfig();

  const themes = useFormFields(
    ([fields]) => fields['general.themes']?.value as Array<string> | undefined
  );
  const customThemeIds = useFormFields(([fields]) => {
    const raw = fields['general.customThemes']?.value;
    return Array.isArray(raw)
      ? raw.map(toId).filter((id): id is number => id !== null)
      : [];
  });

  const [customThemes, setCustomThemes] = useState<
    Array<{ id: number; name: string; slug: string }>
  >([]);

  const sdk = useMemo(
    () =>
      new PayloadSDK<Config>({
        // Same origin as the page: serverURL is the adopted domain, which is
        // cross-site, without the session cookie, on the Fly url
        baseURL: config.routes.api,
        baseInit: token ? { headers: { Authorization: `JWT ${token}` } } : {}
      }),
    [config.routes.api, token]
  );

  // Keyed by the ids so re-selecting the same themes does not refetch
  const idKey = customThemeIds.join(',');

  useEffect(() => {
    if (!idKey) {
      setCustomThemes([]);
      return;
    }

    let active = true;
    sdk
      .find({
        collection: 'custom-themes',
        depth: 0,
        limit: 0,
        // Numbers, not the key's split strings: every other caller passes
        // numeric ids, and a coerced mismatch returns no docs — which shows up
        // as the authored themes silently missing from the options. Parsed from
        // the key rather than closing over the array, which is new every render
        where: { id: { in: idKey.split(',').map(Number) } }
      })
      .then((result) => {
        if (active) {
          setCustomThemes(
            result.docs.map(({ id, name, slug }) => ({ id, name, slug }))
          );
        }
      })
      .catch(() => {
        // Leaves the built-in themes selectable rather than an empty control
        if (active) {
          setCustomThemes([]);
        }
      });

    return () => {
      active = false;
    };
  }, [sdk, idKey]);

  const options: Array<OptionObject> = [
    ...(themes ?? []).map((theme) => ({
      label: themeLabel(theme),
      value: theme
    })),
    ...customThemes.map(({ name, slug }) => ({ label: name, value: slug }))
  ];

  return (
    <SelectInput
      description={field.admin?.description}
      Error={errorMessage}
      label={field.label}
      name={field.name}
      onChange={(option) =>
        setValue(
          option && !Array.isArray(option) && 'value' in option
            ? option.value
            : ''
        )
      }
      options={options}
      path={path}
      readOnly={readOnly}
      required={field.required}
      showError={showError}
      value={value ?? ''}
    />
  );
};

export default DefaultThemeField;
