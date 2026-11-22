import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

/**
 * A migration runs in the release command, before any machine is replaced,
 * so the previous release keeps serving on the new schema, and for good when
 * the deploy fails. An `up()` that drops, renames or tightens something
 * breaks that release.
 *
 * Expand first, contract in a later release. A migration that contracts must
 * carry a `// contract: <why the release before no longer reads it>` line.
 */

const migrationsDir = join(__dirname, 'migrations');

const contractStatements: ReadonlyArray<{ name: string; pattern: RegExp }> = [
  { name: 'DROP COLUMN', pattern: /DROP\s+COLUMN/gi },
  { name: 'RENAME COLUMN', pattern: /RENAME\s+COLUMN/gi },
  { name: 'DROP TABLE', pattern: /DROP\s+TABLE/gi },
  { name: 'RENAME TO', pattern: /RENAME\s+TO/gi },
  { name: 'DROP TYPE', pattern: /DROP\s+TYPE/gi },
  { name: 'SET NOT NULL', pattern: /SET\s+NOT\s+NULL/gi },
  { name: 'SET DATA TYPE', pattern: /SET\s+DATA\s+TYPE/gi },
  {
    name: 'ALTER COLUMN TYPE',
    pattern: /ALTER\s+COLUMN\s+("[^"]+"|\w+)\s+TYPE/gi
  },
  { name: 'DROP DEFAULT', pattern: /DROP\s+DEFAULT/gi },
  { name: 'RENAME VALUE', pattern: /RENAME\s+VALUE/gi }
];

/** Migrations that predate the rule, by exact file name. Sorted. */
const grandfathered: ReadonlyArray<string> = [
  '20250114_154346_cod_219.ts',
  '20250127_132240_cod_249.ts',
  '20250128_150738_cod_255.ts',
  '20250217_224156_payload3.ts',
  '20250305_165910_cod_254.ts',
  '20250314_143517_cod_280.ts',
  '20250328_154057_cod_296.ts',
  '20250411_203150_cod_314.ts',
  '20250414_134656_cod_318.ts',
  '20250416_071659_cod_321.ts',
  '20250416_221010_cod_322.ts',
  '20250421_181801_cod_326.ts',
  '20260409_174321_cod_290.ts',
  '20260418_101207_cod_293_drop_media_prefix.ts',
  '20260809_085018_cod_376.ts',
  '20260812_212841_cod_435.ts',
  '20260831_212629_cod_460_default_custom_theme.ts',
  '20260913_201538_cod_485_tenant_deployment.ts',
  '20260915_213755_cod_484_legal_pages_site_wide.ts',
  '20260926_160659_cod_509_renderer_polish.ts',
  '20260927_010427_cod_512_theme_family.ts',
  '20261108_123050_cod_708_faq_topic.ts'
];

const contractReason = /^\s*\/\/ contract:\s*\S/m;

/** The body of `up()`, up to `down()` or the end of the file */
const upBody = (source: string): string => {
  const start = source.indexOf('export async function up(');
  if (start === -1) {
    return '';
  }
  const end = source.indexOf('export async function down', start);
  return end === -1 ? source.slice(start) : source.slice(start, end);
};

const contractStatementsIn = (body: string): string[] =>
  contractStatements
    .filter(({ pattern }) => body.match(pattern))
    .map(({ name }) => name);

const migrationFiles = readdirSync(migrationsDir)
  .filter((file) => file.endsWith('.ts') && file !== 'index.ts')
  .sort();

describe('migrations survive the old release', () => {
  it.each(migrationFiles.filter((file) => !grandfathered.includes(file)))(
    '%s',
    (file) => {
      const source = readFileSync(join(migrationsDir, file), 'utf8');
      const found = contractStatementsIn(upBody(source));

      if (found.length === 0) {
        return;
      }

      expect({
        file,
        statements: found,
        hasReason: contractReason.test(upBody(source)),
        fix: 'Add a `// contract: <why the release before no longer reads it>` line, or split the migration into expand now, contract in a later release'
      }).toMatchObject({ hasReason: true });
    }
  );

  it('keeps the grandfathered list sorted and free of duplicates', () => {
    expect([...grandfathered]).toEqual([...new Set(grandfathered)].sort());
  });
});
