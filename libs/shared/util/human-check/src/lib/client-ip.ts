/**
 * Who sent this request, as far as the edge will say.
 *
 * `Fly-Client-IP` first because Fly writes it itself and a client cannot forge
 * it; `X-Forwarded-For` is a list a proxy appends to, so only its first entry
 * is the original caller — and even that is a claim, which is why it decides
 * nothing more serious than how often someone may post.
 */
export function clientIp(headers: Headers): string | undefined {
  const fly = headers.get('fly-client-ip')?.trim();

  if (fly) {
    return fly;
  }

  const forwarded = headers.get('x-forwarded-for')?.split(',')[0]?.trim();

  return forwarded || undefined;
}
