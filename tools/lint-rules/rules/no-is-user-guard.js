/**
 * Forbid `isUser` as an authorization guard.
 *
 * `isUser` answers "is this identity a document from the users collection",
 * which is true for a **reader** as well — readers are ordinary users carrying
 * a `reader` workspace role. Using it to decide whether something may be
 * written, exported or managed therefore grants a reader editor powers, and it
 * fails open: the guard passes and the request proceeds.
 *
 * `canEdit` / `canEditIn` answer the capability question instead, and narrow
 * the same way, so they drop straight in.
 *
 * Scope is decided by the `files` glob in the ESLint config, not by this rule.
 * Point it at surfaces where *any* use of `isUser` is an authorization
 * decision — custom endpoints, route handlers, per-collection access files.
 *
 * Do **not** point it at the access layer itself (`src/security`,
 * `util/access`). There `isUser` legitimately discriminates a user document
 * from a tenant api key so the two can be handled differently, with the
 * capability question answered by `canEdit` inside the branch. The rule cannot
 * tell that apart from a guard, and a file full of `eslint-disable` lines
 * teaches a reader nothing.
 *
 * @type {import('eslint').Rule.RuleModule}
 */
export const noIsUserGuard = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow isUser as an authorization guard; use canEdit or canEditIn'
    },
    schema: [],
    messages: {
      noIsUserGuard:
        '`isUser` is true for a reader, so guarding with it grants a reader editor access — and it fails open. Use `canEdit(user)`, or `canEditIn(user, tenant)` when a specific workspace is in question.'
    }
  },

  create(context) {
    return {
      /** Flags the call itself, so `!isUser(x)` and `isUser(x)` both report */
      'CallExpression > Identifier[name="isUser"]'(node) {
        context.report({ node, messageId: 'noIsUserGuard' });
      }
    };
  }
};
