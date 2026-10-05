/**
 * The cdwr.io workspace's custom component, written as an editor would in the
 * component studio. `@site/ui` is what the build resolves the site's own
 * primitives from.
 */

/** The colours the active theme resolves, read live from the page */
export const cdwrIoThemeSwatchSource = `import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@site/ui';

type Props = {
  /** What the swatches show */
  title: string;
  /** One line under the title */
  description?: string;
  /** Comma or newline separated token names, without the leading dashes */
  tokens?: string;
};

const DEFAULT_TOKENS = [
  'primary',
  'primary-foreground',
  'background',
  'foreground',
  'accent',
  'muted',
  'border',
  'ring'
];

const parseTokens = (raw: string): string[] => {
  const names = raw
    .split(/[,\\n]+/)
    .map((part) => part.trim().replace(/^-+/, ''))
    .filter((part) => part !== '');
  return names.length > 0 ? names : DEFAULT_TOKENS;
};

type Swatch = { name: string; value: string };

export default function ThemeSwatch({ title, description, tokens = '' }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [swatches, setSwatches] = useState<Swatch[]>([]);
  const names = useMemo(() => parseTokens(tokens), [tokens]);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    // Read from our own element: a band can set its own data-theme
    const read = () => {
      const style = getComputedStyle(element);
      setSwatches(
        names
          .map((name) => ({
            name,
            value: style.getPropertyValue('--' + name).trim()
          }))
          .filter((swatch) => swatch.value !== '')
      );
    };

    read();
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme', 'class']
    });
    return () => observer.disconnect();
  }, [names]);

  return (
    <div ref={ref}>
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </CardHeader>
        {swatches.length > 0 && (
          <CardContent>
            <ul className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {swatches.map(({ name, value }) => (
                <li key={name} className="flex min-w-0 flex-col gap-2">
                  <div
                    aria-hidden="true"
                    className="aspect-square w-full rounded-md border"
                    style={{ background: 'var(--' + name + ')' }}
                  />
                  <span className="truncate font-mono text-xs">{name}</span>
                  <span className="text-muted-foreground truncate font-mono text-xs">
                    {value}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
`;
