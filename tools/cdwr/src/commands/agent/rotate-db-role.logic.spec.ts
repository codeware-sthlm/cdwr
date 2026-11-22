import { createHash, createHmac } from 'node:crypto';

import { CATALOG } from '../secrets/catalog';

import {
  CMS_ADMIN_SECRET,
  DB_ROLE_TARGETS,
  adminRightsOfRows,
  adminRightsSql,
  alterRoleSql,
  generatePassword,
  parseAdminRights,
  projectRefOf,
  roleOf,
  sameServer,
  scramVerifier,
  withPassword
} from './rotate-db-role.logic';

const POOLER =
  'postgresql://platform_reader.abcdefghijklmnop:old%40pw@aws-0-eu-north-1.pooler.supabase.com:6543/postgres?sslmode=require';
const DIRECT =
  'postgresql://postgres:admin-pw@db.abcdefghijklmnop.supabase.co:5432/postgres';

describe('DB_ROLE_TARGETS', () => {
  it('covers exactly the catalog entries rotated by this command', () => {
    const keys = CATALOG.filter(
      (entry) =>
        entry.kind !== 'setting' &&
        'command' in entry.rotation &&
        entry.rotation.command.join(' ') === 'agent rotate db-role'
    ).map((entry) => entry.key);
    expect(keys.sort()).toEqual(
      Object.values(DB_ROLE_TARGETS)
        .map((t) => t.key)
        .sort()
    );
  });
});

describe('roleOf', () => {
  it("strips a Supabase pooler's project ref", () => {
    expect(roleOf(POOLER)).toBe('platform_reader');
  });

  it('keeps the user on any other host', () => {
    expect(roleOf('postgres://backup_reader:x@db.internal:5432/app')).toBe(
      'backup_reader'
    );
    expect(roleOf(DIRECT)).toBe('postgres');
  });

  it('refuses a user the SQL could not quote as it is', () => {
    expect(() => roleOf('postgres://Bad%22Role:x@h/db')).toThrow(
      /not a plain lower-case role name/
    );
    expect(() => roleOf('postgres://h/db')).toThrow(/has no user/);
  });

  it('never names the url in an error', () => {
    expect(() => roleOf('nope secret-pw')).toThrow(/^the url does not parse$/);
    expect(() => roleOf('mysql://u:secret-pw@h/db')).toThrow(
      /^the url is not a postgres:\/\/ url$/
    );
  });
});

describe('projectRefOf and sameServer', () => {
  it('reads the ref from a pooler user or a direct host', () => {
    expect(projectRefOf(POOLER)).toBe('abcdefghijklmnop');
    expect(projectRefOf(DIRECT)).toBe('abcdefghijklmnop');
    expect(projectRefOf('postgres://u:p@db.internal/x')).toBeUndefined();
  });

  it('pairs a direct admin url with a pooler target of the same project', () => {
    expect(sameServer(DIRECT, POOLER)).toEqual({ ok: true });
  });

  it("pairs the cms's IPv4 pooler admin url with a session pooler target", () => {
    // The direct host is IPv6 only, so the default must stay the pooler url
    expect(CMS_ADMIN_SECRET.key).toBe('DATABASE_URL');
    const admin =
      'postgresql://postgres.abcdefghijklmnop:admin-pw@aws-0-eu-central-1.pooler.supabase.com:6543/postgres';
    const target = POOLER.replace(':6543/', ':5432/');
    expect(roleOf(admin)).toBe('postgres');
    expect(sameServer(admin, target)).toEqual({ ok: true });
  });

  it('refuses another project, or a ref on one side only', () => {
    const other = DIRECT.replace('abcdefghijklmnop', 'qrstuvwxyzabcdef');
    expect(sameServer(other, POOLER)).toMatchObject({ ok: false });
    expect(sameServer('postgres://u:p@db.internal/x', POOLER)).toMatchObject({
      ok: false
    });
  });

  it('compares host and port when neither url has a ref', () => {
    expect(
      sameServer(
        'postgres://a:p@db.internal:5432/x',
        'postgres://b:q@DB.internal:5432/y'
      )
    ).toEqual({ ok: true });
    expect(
      sameServer(
        'postgres://a:p@db.internal/x',
        'postgres://b:q@db.internal:5432/y'
      )
    ).toEqual({ ok: true });
    const refused = sameServer(
      'postgres://a:p@db.internal:5432/x',
      'postgres://b:q@db.internal:5433/x'
    );
    expect(refused).toEqual({
      ok: false,
      why: 'the admin url reaches db.internal:5432, the target db.internal:5433'
    });
    expect(
      sameServer('postgres://a:p@DB.internal/x', 'postgres://b:q@other/y')
    ).toEqual({
      ok: false,
      why: 'the admin url reaches db.internal:5432, the target other:5432'
    });
  });
});

describe('withPassword', () => {
  it('replaces only the password, encoded', () => {
    const url = withPassword(POOLER, 'n€w:p@ss');
    expect(url).toBe(
      'postgresql://platform_reader.abcdefghijklmnop:n%E2%82%ACw%3Ap%40ss@aws-0-eu-north-1.pooler.supabase.com:6543/postgres?sslmode=require'
    );
    expect(decodeURIComponent(new URL(url).password)).toBe('n€w:p@ss');
  });

  it('adds a password to a url without one', () => {
    expect(withPassword('postgres://u@h/db', 'pw')).toBe(
      'postgres://u:pw@h/db'
    );
  });

  it('refuses a url without a user', () => {
    expect(() => withPassword('postgres://h/db', 'pw')).toThrow(/has no user/);
  });
});

describe('scramVerifier', () => {
  // RFC 7677 section 3: user "user", password "pencil"
  const salt = Buffer.from('W22ZaJ0SNY7soEsUEjb6gQ==', 'base64');
  const authMessage = [
    'n=user,r=rOprNGfwEbeRWgbNEkqO',
    'r=rOprNGfwEbeRWgbNEkqO%hvYDpWUa2RaTCAfuxFIlj)hNlF$k0,s=W22ZaJ0SNY7soEsUEjb6gQ==,i=4096',
    'c=biws,r=rOprNGfwEbeRWgbNEkqO%hvYDpWUa2RaTCAfuxFIlj)hNlF$k0'
  ].join(',');
  const proof = Buffer.from(
    'dHzbZapWIk4jUhN+Ute9ytag9zjfMHgsqmmiz7AndVQ=',
    'base64'
  );
  const serverSignature = '6rriTRBi23WpRR/wtup+mMhUZUn/dB5nLTJRsjl95G4=';

  const parts = (verifier: string) => {
    const match =
      /^SCRAM-SHA-256\$(\d+):([^$]+)\$([^:]+):(.+)$/.exec(verifier) ?? [];
    return {
      iterations: Number(match[1]),
      salt: match[2],
      storedKey: Buffer.from(match[3] ?? '', 'base64'),
      serverKey: Buffer.from(match[4] ?? '', 'base64')
    };
  };

  it('verifies the RFC 7677 exchange as Postgres does', () => {
    const v = parts(scramVerifier('pencil', salt, 4096));
    expect(v.iterations).toBe(4096);
    expect(v.salt).toBe('W22ZaJ0SNY7soEsUEjb6gQ==');
    expect(
      createHmac('sha256', v.serverKey).update(authMessage).digest('base64')
    ).toBe(serverSignature);
    const clientSignature = createHmac('sha256', v.storedKey)
      .update(authMessage)
      .digest();
    const clientKey = Buffer.from(
      proof.map((byte, i) => byte ^ (clientSignature[i] ?? 0))
    );
    expect(createHash('sha256').update(clientKey).digest()).toEqual(
      v.storedKey
    );
  });

  it('salts every verifier anew', () => {
    const pw = generatePassword();
    expect(pw).toMatch(/^[0-9a-f]{64}$/);
    expect(scramVerifier(pw)).not.toBe(scramVerifier(pw));
  });

  it('takes printable ASCII only', () => {
    expect(() => scramVerifier('pässword')).toThrow(/printable ASCII/);
  });
});

describe('the SQL', () => {
  it('sets the verifier on the quoted role', () => {
    const verifier = scramVerifier('pencil');
    expect(alterRoleSql('platform_reader', verifier)).toBe(
      `ALTER ROLE "platform_reader" PASSWORD '${verifier}';\n`
    );
  });

  it('refuses anything but a role name and a verifier', () => {
    const verifier = scramVerifier('pencil');
    expect(() => alterRoleSql('x"; drop role y; --', verifier)).toThrow(
      /not a role name/
    );
    expect(() => alterRoleSql('platform_reader', 'plain-password')).toThrow(
      /not a SCRAM-SHA-256 verifier/
    );
    expect(() => adminRightsSql("x' or true --")).toThrow(/not a role name/);
  });

  it('reads the admin rights row', () => {
    expect(parseAdminRights('t|t\n')).toEqual({ exists: true, canAlter: true });
    expect(parseAdminRights('t|f')).toEqual({ exists: true, canAlter: false });
    expect(() => parseAdminRights('')).toThrow(/no row/);
  });

  it('names the columns the API answers by', () => {
    const sql = adminRightsSql('desk_migrator');
    expect(sql).toMatch(/\) as role_exists,\n/);
    expect(sql).toMatch(/, false\) as can_alter;\n$/);
  });

  it("reads the admin rights from the API's rows", () => {
    expect(
      adminRightsOfRows([{ role_exists: true, can_alter: false }])
    ).toEqual({ exists: true, canAlter: false });
    expect(() => adminRightsOfRows([])).toThrow(/no row/);
    expect(() =>
      adminRightsOfRows([{ role_exists: 't', can_alter: 't' }])
    ).toThrow(/unknown row/);
    expect(() => adminRightsOfRows([{ exists: true }])).toThrow(/unknown row/);
  });
});
