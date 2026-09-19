import {
  appliedMigrations,
  extractPayloadSchema,
  isPayloadObject,
  parseDumpHeader
} from './test-migration.logic';

describe('parseDumpHeader', () => {
  it('parses a DDL header', () => {
    expect(
      parseDumpHeader('-- Name: pages; Type: TABLE; Schema: payload; Owner: -')
    ).toEqual({
      name: 'pages',
      type: 'TABLE',
      schema: 'payload'
    });
  });

  it('parses a data header', () => {
    expect(
      parseDumpHeader(
        '-- Data for Name: pages; Type: TABLE DATA; Schema: payload; Owner: -'
      )
    ).toEqual({ name: 'pages', type: 'TABLE DATA', schema: 'payload' });
  });

  it('is undefined for anything else', () => {
    expect(
      parseDumpHeader('CREATE TABLE payload.pages (id integer);')
    ).toBeUndefined();
  });
});

describe('isPayloadObject', () => {
  it('keeps everything in the payload schema', () => {
    expect(
      isPayloadObject({ name: 'pages', type: 'TABLE', schema: 'payload' })
    ).toBe(true);
  });

  it('keeps the payload schema block itself', () => {
    expect(
      isPayloadObject({ name: 'payload', type: 'SCHEMA', schema: '-' })
    ).toBe(true);
  });

  it('keeps public types and enums', () => {
    expect(
      isPayloadObject({ name: 'status', type: 'TYPE', schema: 'public' })
    ).toBe(true);
    expect(
      isPayloadObject({ name: 'status_enum', type: 'ENUM', schema: 'public' })
    ).toBe(true);
  });

  it('drops everything else', () => {
    expect(
      isPayloadObject({ name: 'key', type: 'TABLE', schema: 'pgsodium' })
    ).toBe(false);
    expect(
      isPayloadObject({ name: 'sync', type: 'FUNCTION', schema: 'public' })
    ).toBe(false);
  });
});

describe('extractPayloadSchema', () => {
  const fixture = [
    '-- PostgreSQL database dump',
    '--',
    'SET statement_timeout = 0;',
    "SELECT pg_catalog.set_config('search_path', '', false);",
    'ALTER EXTENSION pgsodium SET SCHEMA pgsodium;',
    '',
    '-- Name: payload; Type: SCHEMA; Schema: -; Owner: -',
    '',
    'CREATE SCHEMA payload;',
    '',
    '-- Name: status; Type: TYPE; Schema: public; Owner: -',
    '',
    "CREATE TYPE public.status AS ENUM ('draft', 'published');",
    '',
    '-- Name: pages; Type: TABLE; Schema: payload; Owner: -',
    '',
    'CREATE TABLE payload.pages (id integer NOT NULL);',
    '',
    '-- Name: key; Type: TABLE; Schema: pgsodium; Owner: -',
    '',
    'CREATE TABLE pgsodium.key (id uuid NOT NULL);',
    '',
    '-- Data for Name: pages; Type: TABLE DATA; Schema: payload; Owner: -',
    '',
    'COPY payload.pages (id) FROM stdin;',
    '1',
    '\\.',
    ''
  ].join('\n');

  it('drops unsafe preamble, keeps payload objects and public types, drops other schemas', () => {
    const filtered = extractPayloadSchema(fixture);

    expect(filtered).not.toContain('ALTER EXTENSION pgsodium');
    expect(filtered).toContain('CREATE SCHEMA payload;');
    expect(filtered).toContain('CREATE TYPE public.status');
    expect(filtered).toContain('CREATE TABLE payload.pages');
    expect(filtered).toContain('COPY payload.pages (id) FROM stdin;');
    expect(filtered).not.toContain('pgsodium.key');
    expect(filtered).toContain('SET statement_timeout = 0;');
  });
});

describe('appliedMigrations', () => {
  it('reads the names off the report line', () => {
    expect(
      appliedMigrations(
        '[migrate] 3 bundled, 2 recorded, pending: foo\n[migrate] applied: foo, bar\n'
      )
    ).toEqual(['foo', 'bar']);
  });

  it('is empty when nothing was applied', () => {
    expect(appliedMigrations('[migrate] applied: (none)\n')).toEqual([]);
  });

  it('is empty when the line is missing', () => {
    expect(appliedMigrations('unrelated output')).toEqual([]);
  });
});
