import * as core from '@actions/core';
import { matchesDeployRule, parseDeployRule } from '@codeware/shared/util/pure';

import type { DeployRules } from './deploy-rules.schema';
import type { AppTenantsMap } from './fetch-app-tenants';

/**
 * Filter app-tenant relationships based on deployment rules.
 *
 * Applies tenant filtering to the discovered app-tenant relationships.
 * Apps that don't match the rules are removed entirely.
 * Apps that match get their tenant lists filtered based on tenant rules.
 *
 * @param appTenants - Original app-tenant mapping from Infisical discovery
 * @param rules - Deployment rules from Infisical
 * @returns Filtered app-tenant mapping
 */
export function filterByDeployRules(
  appTenants: AppTenantsMap,
  rules: DeployRules
): AppTenantsMap {
  const parsedAppRule = parseDeployRule(rules.apps);
  const parsedTenantRule = parseDeployRule(rules.tenants);

  core.info('[filter-by-deploy-rules] Applying deployment rules...');
  core.info(
    `  Apps rule: ${rules.apps} (${parsedAppRule === null ? 'wildcard' : parsedAppRule.join(', ')})`
  );
  core.info(
    `  Tenants rule: ${rules.tenants} (${parsedTenantRule === null ? 'wildcard' : parsedTenantRule.join(', ')})`
  );

  const filtered: AppTenantsMap = {};

  for (const [appName, tenantDetails] of Object.entries(appTenants)) {
    // Check if app matches app rule
    if (!matchesDeployRule(appName, parsedAppRule)) {
      core.info(`  [${appName}] Filtered out by apps rule`);
      continue;
    }

    // Handle tenant filtering
    if (parsedTenantRule === null) {
      // Wildcard: keep all tenants
      filtered[appName] = tenantDetails;
      core.info(
        `  [${appName}] Keeping all ${tenantDetails.length} tenant(s) (wildcard)`
      );
    } else {
      // Specific tenants: filter the list
      const filteredTenants = tenantDetails.filter((detail) =>
        matchesDeployRule(detail.tenant, parsedTenantRule)
      );

      filtered[appName] = filteredTenants;

      const tenantNames = filteredTenants.map((t) => t.tenant).join(', ');
      core.info(
        `  [${appName}] Filtered to ${filteredTenants.length} tenant(s): ${tenantNames || '<none>'}`
      );

      if (filteredTenants.length === 0 && tenantDetails.length > 0) {
        core.warning(
          `  [${appName}] No tenants matched rule, will deploy as single-tenant`
        );
      }
    }
  }

  const totalBeforeFilter = Object.values(appTenants).reduce(
    (sum, tenants) => sum + tenants.length,
    0
  );
  const totalAfterFilter = Object.values(filtered).reduce(
    (sum, tenants) => sum + tenants.length,
    0
  );

  core.info(
    `[filter-by-deploy-rules] Filtered ${Object.keys(appTenants).length} → ${Object.keys(filtered).length} apps, ${totalBeforeFilter} → ${totalAfterFilter} tenant deployments`
  );

  return filtered;
}
