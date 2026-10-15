import type { User } from '@codeware/shared/util/payload-types';
import type { CollectionAfterChangeHook } from 'payload';

import { verifyEmailMail } from '../verify-email';

/**
 * The confirmation mail for a user a tenant admin added, sent without being
 * awaited, so a mail service that is down never stops the user being made.
 * The token is hidden from the hook's own copy of the user, so it is read back.
 */
export const mailVerificationAfterCreateHook: CollectionAfterChangeHook<
  User
> = ({ doc, operation, req }) => {
  if (operation !== 'create' || !req.context?.['mailVerification']) {
    return doc;
  }

  const send = async () => {
    const stored = await req.payload.findByID({
      collection: 'users',
      id: doc.id,
      depth: 0,
      overrideAccess: true,
      showHiddenFields: true,
      req
    });
    const token = stored._verificationToken;
    if (!token) {
      return;
    }
    const mail = verifyEmailMail(req.payload, {
      token,
      name: doc.name,
      locale: req.i18n?.language === 'sv' ? 'sv' : 'en'
    });
    await req.payload.sendEmail({ to: doc.email, ...mail });
  };

  void send().catch((error) =>
    req.payload.logger.error(
      `[users] Could not send the confirmation mail: ${String(error)}`
    )
  );

  return doc;
};
