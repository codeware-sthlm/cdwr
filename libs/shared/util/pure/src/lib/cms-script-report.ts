/**
 * The `KEY=value` lines the scripts under `apps/cms/src/utils` print for
 * `cdwr` to read. One union for the side that writes and the side that reads,
 * so a key renamed on one fails to compile on the other.
 */
export type CmsReportKey =
  | 'APPLY_REPORT'
  | 'CREATED_TENANT'
  | 'RESOLVED_TENANT'
  | 'ROTATED_API_KEY'
  | 'TENANT_DEPLOYMENTS'
  | 'TENANT_DETAILS';

/**
 * The reports whose script may be run again when its report went missing.
 *
 * Reading is safe to repeat, and so is applying a definition, which converges
 * on the same result. Creating a tenant or rotating a key is not: a lost report
 * does not prove nothing happened, and a second run would do it twice.
 */
export type RetryableCmsReportKey = Extract<
  CmsReportKey,
  'APPLY_REPORT' | 'TENANT_DEPLOYMENTS' | 'TENANT_DETAILS'
>;
