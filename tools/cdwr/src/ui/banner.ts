import { CLOUD, CLOUD_WIDTH } from './logo';
import { theme } from './theme';

/** The cloud with the CLI name beside it, for the menu and top-level help */
export function banner(version: string): string {
  const lines = CLOUD.map((line) => theme.brand(line.padEnd(CLOUD_WIDTH)));
  const gap = '   ';
  const text = [
    '',
    '',
    '',
    theme.title('cdwr') + theme.muted(`  ${version}`),
    theme.muted('Codeware developer CLI'),
    '',
    theme.muted('Deployments, databases, tenants,'),
    theme.muted('secrets, media and releases.')
  ];
  return lines.map((line, i) => `${line}${gap}${text[i] ?? ''}`).join('\n');
}
