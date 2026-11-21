/**
 * How long a password may be, wherever one is set: signup, the admin, a reset.
 *
 * Length is the one rule worth enforcing (NIST 800-63B): composition rules make
 * passwords harder to remember, not to guess. The ceiling only keeps hashing a
 * submitted password cheap.
 */
export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;
