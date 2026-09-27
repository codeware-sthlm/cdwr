import { CopyButton } from '@codeware/shared/ui/copy-button';
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

export const TypeScript: StoryObj = {
  render: () => <Code code={tsSnippet} language="typescript" />
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

export const CopyButtonStory: StoryObj = {
  name: 'CopyButton (standalone)',
  render: () => (
    <div className="relative inline-block">
      <pre className="rounded-lg border border-slate-100 p-4 pr-12 text-xs">
        {'const greeting = "Hello, world!";'}
      </pre>
      <CopyButton code={'const greeting = "Hello, world!";'} />
    </div>
  )
};

export const FrostLight = a11yStory(TypeScript, 'frost', 'light');
export const FrostDark = a11yStory(TypeScript, 'frost', 'dark');
export const PayloadAdminLight = a11yStory(
  TypeScript,
  'payload-admin',
  'light'
);
export const PayloadAdminDark = a11yStory(TypeScript, 'payload-admin', 'dark');
export const SpotlightLight = a11yStory(TypeScript, 'spotlight', 'light');
export const SpotlightDark = a11yStory(TypeScript, 'spotlight', 'dark');
export const CodewareLight = a11yStory(TypeScript, 'codeware', 'light');
export const CodewareDark = a11yStory(TypeScript, 'codeware', 'dark');
