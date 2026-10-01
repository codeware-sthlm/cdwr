import path from 'node:path';

import { compile } from '@tailwindcss/node';
import { Scanner } from '@tailwindcss/oxide';

/** Utilities-only Tailwind CSS for the classes used in `source`, themed via `@reference`. */
export const buildStyles = async (
  source: string,
  themeCss: string,
  workspaceRoot: string
): Promise<string> => {
  const reference = path
    .relative(workspaceRoot, themeCss)
    .split(path.sep)
    .join('/');
  const css = `
@layer theme, base, components, utilities;
@import 'tailwindcss/theme.css' layer(theme) theme(reference);
@reference ${JSON.stringify(reference.startsWith('.') ? reference : `./${reference}`)};
@import 'tailwindcss/utilities.css' layer(utilities);
`;
  const compiler = await compile(css, {
    base: workspaceRoot,
    onDependency() {
      // nothing is watched
    }
  });
  const candidates = new Scanner({})
    .getCandidatesWithPositions({ content: source, extension: 'tsx' })
    .map((c) => c.candidate);
  return compiler.build(candidates);
};
