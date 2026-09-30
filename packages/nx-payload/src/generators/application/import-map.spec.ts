import { execFileSync } from 'child_process';
import {
  copyFileSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'fs';
import { join } from 'path';

import { workspaceRoot } from '@nx/devkit';

const files = join(__dirname, 'files', 'src');

/** The entries of an import map, `path#export`, whatever its formatting */
const entries = (importMap: string): Array<string> =>
  [...importMap.matchAll(/["']([^"']+#[^"']+)["']\s*:/g)]
    .map(([, key]) => key)
    .sort();

/**
 * The app ships its admin import map rather than an empty one, since Payload
 * only writes it while the app runs in development: an app built for
 * production first would find none of Payload's own admin components, such
 * as the dashboard's collection cards. So the shipped map must be the one the
 * installed Payload generates for the generated config, and a Payload upgrade
 * that changes it fails here rather than reaching a user.
 */
describe('the generated app import map', () => {
  // Inside the workspace, so the check resolves Payload from its node_modules
  const dir = join(
    workspaceRoot,
    'tmp',
    `nx-payload-import-map-${process.pid}`
  );

  beforeAll(() => {
    mkdirSync(dir, { recursive: true });
    for (const name of ['Users', 'Media']) {
      copyFileSync(
        join(files, 'collections', `${name}.ts__tmpl__`),
        join(dir, `${name}.ts`)
      );
    }
    writeFileSync(join(dir, 'importMap.js'), 'export const importMap = {}\n');
    // The template's config, less the database, which brings no admin
    // components and needs a server to import
    writeFileSync(
      join(dir, 'generate.mjs'),
      `
      import { lexicalEditor } from '@payloadcms/richtext-lexical';
      import { buildConfig, generateImportMap } from 'payload';
      import { Media } from './Media.ts';
      import { Users } from './Users.ts';

      const config = await buildConfig({
        admin: {
          user: Users.slug,
          importMap: { importMapFile: ${JSON.stringify(join(dir, 'importMap.js'))} }
        },
        collections: [Users, Media],
        editor: lexicalEditor(),
        secret: 'import-map-check',
        db: { defaultIDType: 'number', init: () => ({}) }
      });
      await generateImportMap(config, { force: true, log: false });
      `
    );
  });

  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('is what Payload generates for the default config', () => {
    execFileSync(
      process.execPath,
      ['--experimental-strip-types', '--no-warnings', 'generate.mjs'],
      { cwd: dir, stdio: 'pipe' }
    );

    const generated = readFileSync(join(dir, 'importMap.js'), 'utf8');
    const shipped = readFileSync(
      join(files, 'app', '(payload)', 'admin', 'importMap.js__tmpl__'),
      'utf8'
    );

    expect(entries(generated)).not.toHaveLength(0);
    expect(entries(shipped)).toEqual(entries(generated));
  }, 120_000);
});
