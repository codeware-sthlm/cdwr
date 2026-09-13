import type { StatusTone } from '@codeware/app-cms/ui/dashboard';

/** Environments a workspace can be provisioned into */
export type ProvisioningEnvironment = 'production' | 'preview';

/** Whether the `PAYLOAD_API_KEY` in Infisical is this workspace's own key */
export type ApiKeyState = 'matches' | 'missing' | 'mismatch';

/** One app folder under `/tenants/<deployment>/apps/` */
export type InfisicalAppFacts = {
  /** Folder name, e.g. `cms` */
  app: string;
  /** Fly app it deploys as; preview names carry `<n>` for the pull request */
  flyApp: string;
  /** Whether `DEPLOY_RULES` deploys this app for this workspace */
  included: boolean;
  apiKey: ApiKeyState;
  /** Optional keys that are set, e.g. `RESTRICTED_FONTS` */
  optionalKeys: Array<string>;
};

/**
 * What one environment holds for a workspace.
 *
 * `unreadable` when the identity cannot read the environment at all, and
 * `no-rules` when `DEPLOY_RULES` is missing or invalid — without the rules no
 * folder can be judged, since they decide whether it deploys.
 */
export type InfisicalEnvironmentFacts =
  | {
      environment: ProvisioningEnvironment;
      access: 'unreadable' | 'no-rules';
    }
  | {
      environment: ProvisioningEnvironment;
      access: 'ok';
      /** How the tenants rule treats this workspace */
      tenants: 'listed' | 'wildcard' | 'excluded';
      /** App folders that exist; an app without one is not deployed */
      apps: Array<InfisicalAppFacts>;
    };

/** What the status endpoint answers. Facts only, and never a secret value */
export type InfisicalStatus = {
  deployment: string;
  /** ISO time of the read */
  checkedAt: string;
  environments: Array<InfisicalEnvironmentFacts>;
};

/** How one row of the sheet reads */
export type InfisicalRowState =
  | 'key-mismatch'
  | 'missing-key'
  | 'missing-folder'
  | 'no-rules'
  | 'unreadable'
  | 'ready'
  | 'not-provisioned'
  | 'not-deployed';

/** One row: an app folder, or an environment with nothing to show per app */
export type InfisicalStatusItem = {
  environment: ProvisioningEnvironment;
  app: string | null;
  flyApp: string | null;
  state: InfisicalRowState;
  optionalKeys: Array<string>;
};

/**
 * Every state, worst first, with the tone it gives the widget.
 *
 * One table for both the widget and the sheet's order, so the first row a
 * reader sees is the one the widget is talking about.
 */
export const INFISICAL_STATES = [
  { state: 'key-mismatch', tone: 'error' },
  { state: 'missing-key', tone: 'error' },
  { state: 'missing-folder', tone: 'error' },
  { state: 'no-rules', tone: 'warning' },
  { state: 'unreadable', tone: 'warning' },
  { state: 'ready', tone: 'ok' },
  { state: 'not-provisioned', tone: 'neutral' },
  { state: 'not-deployed', tone: 'neutral' }
] as const satisfies ReadonlyArray<{
  state: InfisicalRowState;
  tone: StatusTone;
}>;

const appState = (app: InfisicalAppFacts): InfisicalRowState => {
  if (!app.included) {
    return 'not-deployed';
  }
  if (app.apiKey === 'missing') {
    return 'missing-key';
  }
  return app.apiKey === 'mismatch' ? 'key-mismatch' : 'ready';
};

/**
 * Flatten the facts into rows.
 *
 * The deploy only ships an app for a workspace when its folder exists, so a
 * missing folder is not a fault in itself — most workspaces use one app. It is
 * one only when the tenants rule names this workspace and there is nothing to
 * deploy.
 */
export const toInfisicalStatusItems = (
  status: InfisicalStatus
): Array<InfisicalStatusItem> =>
  status.environments.flatMap((facts): Array<InfisicalStatusItem> => {
    const { environment } = facts;
    const bare = { environment, app: null, flyApp: null, optionalKeys: [] };

    if (facts.access !== 'ok') {
      return [{ ...bare, state: facts.access }];
    }

    if (!facts.apps.length) {
      const state: InfisicalRowState =
        facts.tenants === 'listed'
          ? 'missing-folder'
          : facts.tenants === 'wildcard'
            ? 'not-provisioned'
            : 'not-deployed';
      return [{ ...bare, state }];
    }

    return facts.apps.map((app) => ({
      environment,
      app: app.app,
      flyApp: app.flyApp,
      state: appState(app),
      optionalKeys: app.optionalKeys
    }));
  });

/** What the widget says, before it is put into words */
export type InfisicalVerdict = {
  tone: StatusTone;
  state: InfisicalRowState;
  /** Rows in that state, which is the number the detail line quotes */
  count: number;
};

/** Reduce every row to the one thing worth saying about all of them */
export const summarizeInfisicalStatus = (
  items: Array<InfisicalStatusItem>
): InfisicalVerdict => {
  for (const { state, tone } of INFISICAL_STATES) {
    const count = items.filter((item) => item.state === state).length;
    if (count) {
      return { tone, state, count };
    }
  }

  return { tone: 'neutral', state: 'not-provisioned', count: 0 };
};

const severity = (item: InfisicalStatusItem) =>
  INFISICAL_STATES.findIndex(({ state }) => state === item.state);

/** Order the sheet so the reason the widget is not green comes first */
export const byWorstInfisicalState = (
  a: InfisicalStatusItem,
  b: InfisicalStatusItem
) =>
  severity(a) - severity(b) ||
  a.environment.localeCompare(b.environment) ||
  (a.app ?? '').localeCompare(b.app ?? '');
