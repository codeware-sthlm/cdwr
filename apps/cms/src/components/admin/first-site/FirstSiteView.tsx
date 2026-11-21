import {
  BUILT_IN_TOKENS,
  SITE_THEMES,
  themeLabel
} from '@codeware/shared/theme';
import {
  buildThemeTokens,
  editableTokens,
  parseThemeTokens
} from '@codeware/shared/util/color';
import type { AdminViewServerProps } from 'payload';
import React from 'react';

import { getFirstSiteState } from './first-site-access';
import { FirstSite, type ThemeChoice } from './FirstSite.client';

/** Fitted once per process; the built-in tokens never change while it is up */
let choices: Array<ThemeChoice> | null = null;

const themeChoices = (): Array<ThemeChoice> =>
  (choices ??= SITE_THEMES.flatMap((name) => {
    const tokens = BUILT_IN_TOKENS[name];
    if (!tokens) {
      return [];
    }
    const parsed = parseThemeTokens(tokens);
    const { light } = buildThemeTokens(parsed.recipe, editableTokens(parsed));
    return [{ name, label: themeLabel(name), primary: light['--primary'] }];
  }));

/**
 * The first-site guide, for a workspace admin whose workspace has no pages.
 *
 * Whether it is shown is decided here, from the request, so the client only
 * ever receives the form when applying a site would be accepted.
 */
const FirstSiteView: React.FC<AdminViewServerProps> = async ({
  initPageResult
}) => {
  // From the request, not the `user` prop: a view on its own path is not
  // handed the populated user
  const { user, payload } = initPageResult.req;
  const state = await getFirstSiteState(payload, user);

  return (
    <FirstSite
      adminRoute={payload.config.routes?.admin ?? '/admin'}
      state={state.kind}
      tenantName={state.kind === 'available' ? state.tenantName : ''}
      themes={themeChoices()}
    />
  );
};

export default FirstSiteView;
