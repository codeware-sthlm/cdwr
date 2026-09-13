/**
 * What a real browser sends with a submission, so a test posts like a person.
 *
 * The public submit endpoints refuse anything that cannot show a person filled
 * the form in: an empty honeypot, and enough time between the form being drawn
 * and sent. A test posting straight to the route has no form to draw, so it
 * says when a person would have been given one.
 *
 * Deliberately not a way around the check — the guard still runs, and
 * `human-check.spec.ts` proves it refuses every shape this one satisfies.
 * Turnstile is not configured in e2e, so the token stays empty.
 */
export const humanProof = (): {
  token: string;
  honeypot: string;
  elapsedMs: number;
} => ({
  token: '',
  honeypot: '',
  // Comfortably past the minimum, so a slow machine cannot make a test flake
  elapsedMs: 30_000
});
