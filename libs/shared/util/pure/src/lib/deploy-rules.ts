/** Which apps and tenants an environment deploys, as written in `DEPLOY_RULES` */
export type DeployRules = {
  /** `*` for every app, or a comma-separated list such as `web,cms` */
  apps: string;
  /** `*` for every tenant, or a comma-separated list such as `_default,demo` */
  tenants: string;
};

/** The parts of an Infisical secret the rules are read from */
export type DeployRulesSecret = {
  secretValue: string;
  secretMetadata: ReadonlyArray<{ key: string; value: string }>;
};

const isRule = (value: unknown): value is string =>
  typeof value === 'string' && value.trim() !== '';

const INVALID = 'DEPLOY_RULES format is invalid.';

/**
 * Read the rules out of the `DEPLOY_RULES` secret.
 *
 * Metadata with both `apps` and `tenants` wins; otherwise the value must be
 * JSON with both. Either way both rules are required and non-empty.
 *
 * @throws An error naming `DEPLOY_RULES` when neither form holds valid rules
 */
export function readDeployRules(secret: DeployRulesSecret): {
  rules: DeployRules;
  source: 'metadata' | 'value';
} {
  const apps = secret.secretMetadata.find((m) => m.key === 'apps');
  const tenants = secret.secretMetadata.find((m) => m.key === 'tenants');

  if (apps && tenants) {
    if (!isRule(apps.value) || !isRule(tenants.value)) {
      throw new Error(
        `${INVALID} The 'apps' and 'tenants' metadata must not be empty.`
      );
    }

    return {
      rules: { apps: apps.value, tenants: tenants.value },
      source: 'metadata'
    };
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(secret.secretValue);
  } catch (error) {
    throw new Error(
      `${INVALID} Must have metadata with 'apps' and 'tenants' keys, or be valid JSON. Error: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  const value = (parsed ?? {}) as Partial<Record<keyof DeployRules, unknown>>;

  if (!isRule(value.apps) || !isRule(value.tenants)) {
    throw new Error(
      `${INVALID} Must have metadata with 'apps' and 'tenants' keys, or JSON with both as non-empty strings.`
    );
  }

  return {
    rules: { apps: value.apps, tenants: value.tenants },
    source: 'value'
  };
}

/**
 * Parse one rule into the values it names.
 *
 * @returns `null` for the `*` wildcard, otherwise the listed values
 */
export function parseDeployRule(rule: string): string[] | null {
  const trimmed = rule.trim();

  if (trimmed === '*') {
    return null;
  }

  return trimmed
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

/** Whether a parsed rule includes a value; the wildcard includes everything */
export function matchesDeployRule(
  value: string,
  rule: string[] | null
): boolean {
  return rule === null || rule.includes(value);
}
