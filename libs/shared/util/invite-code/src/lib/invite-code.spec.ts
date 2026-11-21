import {
  generateInviteCode,
  hashInviteSecret,
  parseInviteCode,
  verifyInviteSecret
} from './invite-code';

describe('generateInviteCode', () => {
  it('is four groups of four Crockford characters', () => {
    expect(generateInviteCode()).toMatch(
      /^[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){3}$/
    );
  });

  it('differs each time', () => {
    expect(generateInviteCode()).not.toBe(generateInviteCode());
  });

  it('parses back into its halves', () => {
    const code = generateInviteCode();
    const parts = parseInviteCode(code);
    expect(parts && `${parts.lookup}${parts.secret}`).toBe(
      code.replace(/-/g, '')
    );
  });
});

describe('parseInviteCode', () => {
  it('splits a code into lookup and secret', () => {
    expect(parseInviteCode('ABCD-EFGH-JKMN-PQRS')).toEqual({
      lookup: 'ABCDEFGH',
      secret: 'JKMNPQRS'
    });
  });

  it('forgives case, spaces, dashes and look-alike letters', () => {
    expect(parseInviteCode(' abcd efgh-jkmn pqoi ')).toEqual({
      lookup: 'ABCDEFGH',
      secret: 'JKMNPQ01'
    });
  });

  it.each([
    ['nothing', undefined],
    ['an empty string', ''],
    ['too short', 'ABCD-EFGH-JKMN'],
    ['too long', 'ABCD-EFGH-JKMN-PQRS-T'],
    ['a letter outside the alphabet', 'ABCD-EFGH-JKMN-PQRU']
  ])('refuses %s', (_label, input) => {
    expect(parseInviteCode(input)).toBeNull();
  });
});

describe('hashInviteSecret and verifyInviteSecret', () => {
  it('matches the secret it was made from', async () => {
    const stored = await hashInviteSecret('JKMNPQRS');
    expect(stored).toMatch(/^scrypt\$[\w-]+\$[\w-]+$/);
    await expect(verifyInviteSecret('JKMNPQRS', stored)).resolves.toBe(true);
  });

  it('salts each hash', async () => {
    expect(await hashInviteSecret('JKMNPQRS')).not.toBe(
      await hashInviteSecret('JKMNPQRS')
    );
  });

  it('refuses another secret', async () => {
    const stored = await hashInviteSecret('JKMNPQRS');
    await expect(verifyInviteSecret('JKMNPQRT', stored)).resolves.toBe(false);
  });

  it.each([
    ['no hash', undefined],
    ['another scheme', 'bcrypt$abc$def'],
    ['a truncated hash', 'scrypt$AAAA$AAAA'],
    ['garbage', 'not-a-hash']
  ])('refuses %s', async (_label, stored) => {
    await expect(verifyInviteSecret('JKMNPQRS', stored)).resolves.toBe(false);
  });
});
