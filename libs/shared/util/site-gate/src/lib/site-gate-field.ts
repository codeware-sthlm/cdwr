/**
 * The id of the gate page's password field, on the cms and the headless gate
 * alike; the audit tools recognise the gate page by it.
 *
 * Its own module, with no Node builtins, so a client bundle can share the id.
 */
export const SITE_GATE_FIELD_ID = 'site-gate-password';
