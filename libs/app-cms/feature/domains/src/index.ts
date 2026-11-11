export {
  CERTIFICATE_ACTIONS,
  type CertificateAction,
  type CertificateResult,
  runCertificateAction
} from './lib/certificate-action';
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
  type ExpectedRecords,
  PUBLIC_RESOLVERS,
  type RecordJudgement,
  type RecordSet,
  type RecordVerdict,
  type RecordsJudgement,
  type ResolverAnswer,
  type ResolverComparison,
  emptyRecordSet,
  guessZone,
  hasRecords,
  judgeRecords,
  normaliseRecords,
  registrarName,
  resolversAgree
} from './lib/resolver-comparison';
export {
  type HostnameProblem,
  type HostnameResult,
  parseHostname
} from './lib/parse-hostname';
export type { TenantDomain, TenantWithDomains } from './lib/tenant-domain';
export { validateHostname } from './lib/validate-hostname';
