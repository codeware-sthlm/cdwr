export {
  type AdoptableDomains,
  adoptableDomains
} from './lib/adoptable-domains';
export {
  type CertificateState,
  applyCertificateState,
  toCertificateState
} from './lib/certificate-state';
export { describeCertificateIssues } from './lib/certificate-issues';
export { domainsField } from './lib/domains-field';
export {
  type FlyApiResult,
  flyUnavailableMessage,
  getFlyApi
} from './lib/get-fly-api';
export { guardDomainConflicts } from './lib/guard-domain-conflicts';
export { normalizeDomains } from './lib/normalize-domains';
export {
  PUBLIC_RESOLVERS,
  type ResolverAnswer,
  type ResolverComparison,
  normaliseRecords,
  resolversAgree
} from './lib/resolver-comparison';
export {
  type HostnameProblem,
  type HostnameResult,
  parseHostname
} from './lib/parse-hostname';
export type { TenantDomain, TenantWithDomains } from './lib/tenant-domain';
export { validateHostname } from './lib/validate-hostname';
