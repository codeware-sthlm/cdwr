import {
  LEDGER_QUERY,
  MIGRATION_FILE,
  PSQL_ARGS,
  applySql,
  dryRunSql,
  firstErrorLine,
  ledgerMissing,
  migrationName,
  psqlEnv,
  transactionStatement
} from './supabase-migrate.logic';

const DIR = 'tools/cdwr/agent-queue/supabase/migrations';

describe('psqlEnv', () => {
  it('splits the url into libpq variables, sslmode defaulting to require', () => {
    expect(
      psqlEnv('postgres://postgres:pw@db.example.co:6543/postgres')
    ).toEqual({
      PGHOST: 'db.example.co',
      PGPORT: '6543',
      PGUSER: 'postgres',
      PGPASSWORD: 'pw',
      PGDATABASE: 'postgres',
      PGSSLMODE: 'require'
    });
  });

  it('leaves the port out when the url has none', () => {
    const env = psqlEnv('postgresql://u:pw@db.example.co/app');
    expect(env['PGPORT']).toBeUndefined();
    expect(env['PGHOST']).toBe('db.example.co');
    expect(env['PGDATABASE']).toBe('app');
  });

  it('takes sslmode from the query', () => {
    expect(
      psqlEnv('postgres://u:pw@h:5432/db?sslmode=verify-full')['PGSSLMODE']
    ).toBe('verify-full');
  });

  it('decodes a percent-encoded password', () => {
    expect(psqlEnv('postgres://u:p%40ss%2Fw%3Ard@h/db')['PGPASSWORD']).toBe(
      'p@ss/w:rd'
    );
  });

  it('refuses a url that is not postgres without quoting it', () => {
    expect(() => psqlEnv('mysql://u:secret@h/db')).toThrow(/not a postgres/);
    expect(() => psqlEnv('nonsense secret')).not.toThrow(/secret/);
  });
});

describe('MIGRATION_FILE', () => {
  it.each([
    `${DIR}/20261120120000_applied_migrations.sql`,
    `${DIR}/20261029120000_github_events.sql`
  ])('accepts %s', (file) => {
    expect(MIGRATION_FILE.test(file)).toBe(true);
  });

  it.each([
    `${DIR}/2026112012000_short.sql`,
    `${DIR}/20261120120000_Upper.sql`,
    `${DIR}/20261120120000_x.sql.bak`,
    `${DIR}/../20261120120000_x.sql`,
    `${DIR}/sub/20261120120000_x.sql`,
    `/${DIR}/20261120120000_x.sql`,
    `other/${DIR}/20261120120000_x.sql`,
    `${DIR}/20261120120000_x.sql\n`
  ])('rejects %j', (file) => {
    expect(MIGRATION_FILE.test(file)).toBe(false);
  });

  it('names the migration by its file name', () => {
    expect(migrationName(`${DIR}/20261120120000_x.sql`)).toBe(
      '20261120120000_x.sql'
    );
  });
});

describe('transactionStatement', () => {
  it.each([
    'begin;',
    'COMMIT;',
    '  Rollback ;',
    'begin transaction;',
    'x;\ncommit;\n',
    'end;',
    'abort;',
    'start transaction isolation level serializable;',
    'commit and chain;',
    'create table t (id int); commit;',
    'savepoint s;',
    'release savepoint s;',
    'rollback to savepoint s;',
    'set transaction read only;',
    'SET LOCAL TRANSACTION isolation level serializable;',
    'set session characteristics as transaction read only;',
    "prepare transaction 'x';",
    "commit prepared 'x';",
    'select 1 /* c */;\n  commit',
    '\\! curl https://example.com',
    'select 1; \\o |sh',
    "\\copy t from program 'id'"
  ])('finds %j', (sql) => {
    expect(transactionStatement(sql)).toBeDefined();
  });

  it('leaves a plpgsql block and ordinary statements alone', () => {
    const sql = [
      'create function f() returns void language plpgsql as $$',
      'begin',
      '  perform 1;',
      'end',
      '$$;',
      'create function g() returns void language plpgsql as $body$',
      'begin',
      '  if true then perform 1; end if;',
      'end;',
      '$body$;',
      '-- commit; later',
      "insert into t (s) values ('x; commit');",
      '/* rollback; */',
      'select 1;'
    ].join('\n');
    expect(transactionStatement(sql)).toBeUndefined();
  });
});

describe('the SQL psql is fed', () => {
  const sql = 'create table t (id int);';

  it('wraps the dry run in a transaction that rolls back', () => {
    expect(dryRunSql(sql)).toBe(`BEGIN;\n${sql}\nROLLBACK;\n`);
  });

  it('commits the migration and its ledger row together', () => {
    expect(applySql(sql)).toBe(
      `BEGIN;\n${sql}\ninsert into public.applied_migrations (file) values (:'file');\nCOMMIT;\n`
    );
  });

  it('asks the ledger by the file variable', () => {
    expect(LEDGER_QUERY).toContain("file = :'file'");
  });

  it('stops at the first error and keeps the url out of the arguments', () => {
    expect(PSQL_ARGS).toEqual(['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-At']);
  });
});

describe('psql errors', () => {
  it('takes the first ERROR line', () => {
    expect(
      firstErrorLine(
        'NOTICE: skipping\npsql:<stdin>:3: ERROR:  syntax error at or near "x"\nLINE 1: x\n'
      )
    ).toBe('psql:<stdin>:3: ERROR:  syntax error at or near "x"');
  });

  it('falls back to the first line, then to a note', () => {
    expect(firstErrorLine('\nconnection refused\nmore')).toBe(
      'connection refused'
    );
    expect(firstErrorLine('')).toBe('no output');
  });

  it('knows a ledger that does not exist yet', () => {
    expect(
      ledgerMissing(
        'psql:<stdin>:1: ERROR:  relation "public.applied_migrations" does not exist'
      )
    ).toBe(true);
    expect(ledgerMissing('ERROR: permission denied')).toBe(false);
  });
});
