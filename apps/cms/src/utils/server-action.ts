/**
 * Whether a `Next-Action` header holds an id Next could have built.
 *
 * Next 16 ids are 42 hex characters (`SERVER_REFERENCE_ID_LENGTH` in
 * `next/dist/shared/lib/server-reference-info`). Scanners probing for
 * React2Shell send `Next-Action: x`, which Next reports as a missing action
 * and Sentry records as an error. A well-formed id that the build doesn't know
 * is a tab left open across a deploy, so that one still reaches Next.
 */
export const isWellFormedActionId = (id: string): boolean =>
  /^[0-9a-f]{42}$/i.test(id);
