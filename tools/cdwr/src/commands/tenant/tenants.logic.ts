import { CliError, EXIT } from '../../cli/errors';

/** Why `--tenant` has nothing to choose: no folder under /tenants that this identity can see */
export const noTenantsError = (environment: string): CliError =>
  new CliError(
    `No tenant under /tenants in ${environment}`,
    EXIT.failed,
    `If ${environment} should hold one, check that the Infisical identity (or service token) can read ${environment} and that INFISICAL_PROJECT_ID names the right project`
  );
