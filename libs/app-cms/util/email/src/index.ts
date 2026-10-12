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
export { renderNotificationMail } from './lib/templates/tour-signup/notification';
export { renderSeatsFreedMail } from './lib/templates/tour-signup/seats-freed';
export {
  PLATFORM_EMAIL_BRAND,
  emailBrandFromSettings
} from './lib/email-brand';
