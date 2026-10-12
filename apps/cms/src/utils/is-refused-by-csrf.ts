const hasCookie = (headers: Headers, name: string) =>
  (headers.get('Cookie') ?? '').split(';').some((pair) => {
    const [key, ...value] = pair.trim().split('=');
    return key === name && value.join('=') !== '';
  });

/**
 * Whether a 401 or 403 came from Payload refusing the session cookie under its
 * CSRF rules, as the cookie strategy in Payload's `extractJWT` decides it.
 *
 * With a non-empty `csrf`, the token cookie is dropped when the Origin is not
 * listed or, without an Origin, unless `Sec-Fetch-Site` is same-origin,
 * same-site or none. The request then runs anonymous, so it fails with 401 or
 * 403. A request with `Authorization` authenticates another way and never
 * counts. Pass the list as it is at request time: domains adopted in `onInit`
 * mutate `payload.config.csrf`.
 */
export const isRefusedByCsrf = ({
  status,
  headers,
  csrf,
  cookiePrefix
}: {
  status: number;
  headers: Headers | undefined;
  csrf: string[] | undefined;
  cookiePrefix: string;
}): boolean => {
  if ((status !== 401 && status !== 403) || !headers || !csrf?.length) {
    return false;
  }
  if (headers.get('Authorization')) {
    return false;
  }
  if (!hasCookie(headers, `${cookiePrefix}-token`)) {
    return false;
  }

  const origin = headers.get('Origin');
  if (origin) {
    return !csrf.includes(origin);
  }

  const site = headers.get('Sec-Fetch-Site');
  return site !== 'same-origin' && site !== 'same-site' && site !== 'none';
};
