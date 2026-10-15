export { etherealFallbackAdapter } from './lib/ethereal-fallback-adapter';
export { getEmailAdapter } from './lib/get-email-adapter';
export {
  type TourSignupMailInput,
  sendTourSignupEmails
} from './lib/send-tour-signup-emails';
export {
  type EmailBrand,
  NEUTRAL_ACCENT,
  escape,
  renderEmailLayout
} from './lib/templates/layout';
export {
  type CustomerMailKind,
  renderCustomerMail
} from './lib/templates/tour-signup/customer';
export {
  type ForgotPasswordMailInput,
  renderForgotPasswordMail
} from './lib/templates/forgot-password/forgot-password';
export {
  type AccountExistsMailInput,
  renderAccountExistsMail
} from './lib/templates/account-exists/account-exists';
export {
  type PlatformMail,
  type SignupEmailsInput,
  sendPlatformMail,
  sendSignupEmails
} from './lib/send-signup-emails';
export {
  type SignupNoticeMailInput,
  renderSignupNoticeMail
} from './lib/templates/signup-notice/signup-notice';
export {
  type VerifyEmailMailInput,
  renderVerifyEmailMail
} from './lib/templates/verify-email/verify-email';
export { renderNotificationMail } from './lib/templates/tour-signup/notification';
export { renderSeatsFreedMail } from './lib/templates/tour-signup/seats-freed';
export {
  type BuiltInThemes,
  PLATFORM_EMAIL_BRAND,
  emailBrandFromSettings
} from './lib/email-brand';
export { withTextPart } from './lib/with-text-part';
