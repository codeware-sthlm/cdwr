import { a11yStory } from '@codeware/shared/util/storybook';
import type { Meta, StoryObj } from '@storybook/react-vite';

import { Code } from './Code';

const meta = {
  title: 'Shared UI/Code'
} satisfies Meta;

export default meta;

const tsSnippet = `import { Code } from '@codeware/shared/ui/code';

export function Example() {
  return (
    <Code
      code="const x = 42;"
      language="typescript"
    />
  );
}`;

const jsonSnippet = `{
  "name": "@codeware/example",
  "version": "1.0.0",
  "dependencies": {
    "react": "^19.0.0"
  }
}`;

const tsxSnippet = `// A card with a few JSX attributes
export function Card({ title }: { title: string }) {
  return (
    <section className="card" id="main" data-state="open">
      <h2 aria-label="Title">{title}</h2>
      <a href="/docs" target="_blank" rel="noreferrer">
        Read more
      </a>
    </section>
  );
}`;

export const TypeScript: StoryObj = {
  render: () => <Code code={tsSnippet} language="typescript" />
};

export const TSX: StoryObj = {
  name: 'TSX',
  render: () => <Code code={tsxSnippet} language="tsx" />
};

export const TSXDark: StoryObj = {
  name: 'TSX dark theme (vsDark)',
  render: () => <Code code={tsxSnippet} language="tsx" theme="vsDark" />
};

export const JSON: StoryObj = {
  name: 'JSON',
  render: () => <Code code={jsonSnippet} language="json" />
};

export const NoLanguage: StoryObj = {
  name: 'Plain text',
  render: () => (
    <Code code={'Hello world\nThis is plain text\nNo syntax highlighting'} />
  )
};

export const DarkTheme: StoryObj = {
  name: 'Dark theme (vsDark)',
  render: () => <Code code={tsSnippet} language="typescript" theme="vsDark" />
};

export const NightOwl: StoryObj = {
  name: 'Night Owl theme',
  render: () => <Code code={tsSnippet} language="typescript" theme="nightOwl" />
};

// A dark scheme pairs with vsDark, as CodeBlock renders it; the line numbers and
// copy button take theme tokens, so they must sit on the matching Prism surface
export const FrostLight = a11yStory(TypeScript, 'frost', 'light');
export const FrostDark = a11yStory(DarkTheme, 'frost', 'dark');
export const PayloadAdminLight = a11yStory(
  TypeScript,
  'payload-admin',
  'light'
);
export const PayloadAdminDark = a11yStory(DarkTheme, 'payload-admin', 'dark');
export const SpotlightLight = a11yStory(TypeScript, 'spotlight', 'light');
export const SpotlightDark = a11yStory(DarkTheme, 'spotlight', 'dark');
export const CodewareLight = a11yStory(TypeScript, 'codeware', 'light');
export const CodewareDark = a11yStory(DarkTheme, 'codeware', 'dark');

export const TsxFrostLight = a11yStory(TSX, 'frost', 'light');
export const TsxFrostDark = a11yStory(TSXDark, 'frost', 'dark');
export const TsxPayloadAdminLight = a11yStory(TSX, 'payload-admin', 'light');
export const TsxPayloadAdminDark = a11yStory(TSXDark, 'payload-admin', 'dark');
export const TsxSpotlightLight = a11yStory(TSX, 'spotlight', 'light');
export const TsxSpotlightDark = a11yStory(TSXDark, 'spotlight', 'dark');
export const TsxCodewareLight = a11yStory(TSX, 'codeware', 'light');
export const TsxCodewareDark = a11yStory(TSXDark, 'codeware', 'dark');
