// The tenant view's types. A row mirrors a `tenant_state` row; the read step refines the loose fields.

/** One tenant as the `tenant_state` table holds it */
export type TenantRow = {
  /** The tenant's slug */
  key: string;
  /** When the row was last written, an ISO timestamp */
  at: string;
  name: string;
  deployment: string;
  status: string;
  apps: unknown;
  domains: unknown;
  switches: unknown;
  db: unknown;
  errors: unknown;
};
