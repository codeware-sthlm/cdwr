// Web APIs only, so the same file runs in Deno on Supabase and under vitest

const encoder = new TextEncoder();

const hex = (bytes: ArrayBuffer): string =>
  Array.from(new Uint8Array(bytes), (b) =>
    b.toString(16).padStart(2, '0')
  ).join('');

/** Compares without returning early, so the time taken says nothing about the match */
export const sameText = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
};

/** The hex HMAC-SHA256 of the body */
export const sign = async (secret: string, body: string): Promise<string> => {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  return hex(await crypto.subtle.sign('HMAC', key, encoder.encode(body)));
};
