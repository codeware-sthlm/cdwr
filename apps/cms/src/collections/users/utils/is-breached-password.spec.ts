import { createHash } from 'node:crypto';

import { isBreachedPassword } from './is-breached-password';

const sha1 = (value: string) =>
  createHash('sha1').update(value).digest('hex').toUpperCase();

const answering = (body: string, ok = true) =>
  jest.fn().mockResolvedValue({ ok, text: () => Promise.resolve(body) });

describe('isBreachedPassword', () => {
  const password = 'correct horse battery';
  const hash = sha1(password);

  it('sends only the first five characters of the hash', async () => {
    const fetcher = answering('');

    await isBreachedPassword(password, fetcher);

    expect(fetcher).toHaveBeenCalledWith(
      `https://api.pwnedpasswords.com/range/${hash.slice(0, 5)}`,
      expect.objectContaining({ headers: { 'Add-Padding': 'true' } })
    );
  });

  it('is breached when the suffix is listed with a count', async () => {
    const fetcher = answering(`0000A:1\r\n${hash.slice(5)}:42\r\n`);

    expect(await isBreachedPassword(password, fetcher)).toBe(true);
  });

  it('ignores a padding entry with a count of 0', async () => {
    const fetcher = answering(`${hash.slice(5)}:0\r\n`);

    expect(await isBreachedPassword(password, fetcher)).toBe(false);
  });

  it('is not breached when the suffix is absent', async () => {
    expect(await isBreachedPassword(password, answering('ABCDEF:3'))).toBe(
      false
    );
  });

  it('fails open on an error answer', async () => {
    const fetcher = answering(`${hash.slice(5)}:42`, false);

    expect(await isBreachedPassword(password, fetcher)).toBe(false);
  });

  it('fails open when the request throws', async () => {
    const fetcher = jest.fn().mockRejectedValue(new Error('timeout'));

    expect(await isBreachedPassword(password, fetcher)).toBe(false);
  });
});
