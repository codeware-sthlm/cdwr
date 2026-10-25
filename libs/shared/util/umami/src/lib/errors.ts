/** A call to Umami that did not give a usable answer */
export class UmamiError extends Error {
  override readonly name = 'UmamiError';

  constructor(
    message: string,
    /** `timeout` and `unavailable` mean Umami is probably waking up */
    readonly kind: 'timeout' | 'unavailable' | 'refused' | 'bad-answer',
    /** The status Umami refused with, kept out of the message */
    readonly status?: number,
    /** The start of the refusal's body, kept out of the message */
    readonly detail?: string
  ) {
    super(message);
  }
}

/** Umami refused to create a user because the username is taken */
export class UmamiUserExistsError extends Error {
  override readonly name = 'UmamiUserExistsError';

  constructor(readonly username: string) {
    super('Umami user already exists');
  }
}

/** Umami has no user with the given id */
export class UmamiNotFoundError extends Error {
  override readonly name = 'UmamiNotFoundError';

  constructor(readonly userId: string) {
    super('Umami user not found');
  }
}

/** What Fly's proxy answers while the machine is not reachable */
export const WAKING_STATUSES: ReadonlyArray<number> = [502, 503, 504];

/** Umami did not answer in time, which is what a suspended service does while it resumes */
export const isWaking = (error: unknown): boolean =>
  error instanceof UmamiError &&
  (error.kind === 'timeout' || error.kind === 'unavailable');
