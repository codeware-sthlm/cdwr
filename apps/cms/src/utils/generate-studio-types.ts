import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Writes the declarations the component studio's editor type-checks against,
 * collected from the workspace the way a build resolves them. Run before
 * `dev` and `build`; the admin loads the file from `/studio-types.json`.
 */
const outFile = path.join(process.cwd(), 'public', 'studio-types.json');

// Imported when run, as the cms does: the toolchain never enters a graph Next bundles
const { collectEditorTypes, resolveToolchain } =
  await import('@codeware/app-cms/feature/component-builder');

const resolved = resolveToolchain({
  override: process.env['COMPONENT_TOOLCHAIN_ROOT'],
  cwd: process.cwd()
});
if (!resolved.ok) {
  console.error(`[studio-types] ${resolved.reason}`);
  process.exit(1);
}

const started = Date.now();
const types = collectEditorTypes(resolved.toolchain);
const json = JSON.stringify(types);

mkdirSync(path.dirname(outFile), { recursive: true });
writeFileSync(outFile, json);

console.log(
  `[studio-types] ${Object.keys(types.files).length} files, ${(json.length / 1024 / 1024).toFixed(1)} MB, version ${types.version}, in ${Date.now() - started} ms`
);
