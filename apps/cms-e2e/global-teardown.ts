import { existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';

import MCR from 'monocart-coverage-reports';

import type { CoverageJsonContent } from './src/fixtures';

/**
 * Playwright global teardown — merges raw V8 coverage and generates report.
 *
 * Raw coverage files are written per-test by the `_coverage` fixture as JSON files.
 * We read each file, extract the content, and pass it to monocart via mcr.add()
 * which accepts plain V8 arrays directly.
 *
 * Output is written to `.coverage/` as HTML (v8) + lcov.
 */
export default async function () {
  const rawDir = join(import.meta.dirname, '.coverage', 'raw');

  if (!existsSync(rawDir) || readdirSync(rawDir).length === 0) {
    console.log('[coverage] No raw coverage data found, skipping report.');
    return;
  }

  //  const MCR = require('monocart-coverage-reports');

  const coverageReport = MCR({
    name: 'CMS E2E Coverage',
    outputDir: join(import.meta.dirname, '.coverage'),
    reports: ['v8', 'lcov', 'console-summary'],
    entryFilter: (entry: { url: string }) => {
      // Browser coverage uses http:// URLs — keep only app source files
      const url = entry.url || '';
      return url.startsWith('http://localhost');
    },
    sourceFilter: (sourcePath: string) => {
      // Source map paths use workspace-relative dirs: cms/src/... and libs/...
      // Everything else like localhost chunk URLs, [turbopack] runtime, node_modules,
      // Next.js internals is excluded.
      return sourcePath.startsWith('cms/') || sourcePath.startsWith('libs/');
    }
  });

  const files = readdirSync(rawDir).filter((f) => f.endsWith('.json'));
  for (const file of files) {
    // Each file is saved according to fixture definition
    const coverage = JSON.parse(
      readFileSync(join(rawDir, file), 'utf-8')
    ) as unknown as CoverageJsonContent;

    // Drop entries that have no source map reference. Monocart marks these
    // chunks as un-deduped and renders their raw URL (localhost-3000/...) in
    // the v8 HTML report. Chunks WITH a sourceMappingURL get dedupe=true so
    // only the original source files (cms/src/…, libs/…) appear.
    const entries = coverage.result.filter(
      (e) =>
        e.url?.startsWith('http://localhost') &&
        e.source?.includes('sourceMappingURL')
    );
    if (entries.length > 0) {
      await coverageReport.add(entries);
    }
  }

  await coverageReport.generate();
}
