import { a11yStory } from '@codeware/shared/util/storybook';
import type { Meta, StoryObj } from '@storybook/react-vite';

import { CodeBlock } from './CodeBlock';

const meta = {
  title: 'cms-renderer/CodeBlock',
  component: CodeBlock,
  parameters: { layout: 'padded' }
} satisfies Meta<typeof CodeBlock>;

export default meta;
type Story = StoryObj<typeof meta>;

export const TypeScript: Story = {
  args: {
    blockType: 'code',
    language: 'ts',
    code: `import { useState } from 'react';

interface CounterProps {
  initialCount?: number;
}

export function Counter({ initialCount = 0 }: CounterProps) {
  const [count, setCount] = useState(initialCount);
  return (
    <button onClick={() => setCount(count + 1)}>
      Count: {count}
    </button>
  );
}`
  }
};

export const TSX: Story = {
  args: {
    blockType: 'code',
    language: 'tsx',
    code: `export function Badge({ label, variant = 'default' }: {
  label: string;
  variant?: 'default' | 'outline';
}) {
  return (
    <span
      className={cn(
        'rounded-full px-3 py-1 text-sm font-medium',
        variant === 'outline'
          ? 'border border-primary text-primary'
          : 'bg-primary text-primary-foreground'
      )}
    >
      {label}
    </span>
  );
}`
  }
};

export const JavaScript: Story = {
  args: {
    blockType: 'code',
    language: 'js',
    code: `async function fetchPosts(limit = 10) {
  const res = await fetch(\`/api/posts?limit=\${limit}\`);
  if (!res.ok) {
    throw new Error(\`Request failed: \${res.status}\`);
  }
  const { docs } = await res.json();
  return docs;
}`
  }
};

export const Plaintext: Story = {
  args: {
    blockType: 'code',
    language: 'plaintext',
    code: `NEXT_PUBLIC_PAYLOAD_URL=http://localhost:3000
DATABASE_URL=postgresql://user:pass@localhost:5432/mydb
S3_BUCKET=my-uploads
S3_REGION=eu-north-1`
  }
};

const a11yArgs: Story['args'] = {
  blockType: 'code',
  language: 'ts',
  code: 'const x: string = "hello";'
};

export const ShadcnLight = a11yStory({ args: a11yArgs }, 'shadcn', 'light');
export const ShadcnDark = a11yStory({ args: a11yArgs }, 'shadcn', 'dark');
export const PayloadAdminLight = a11yStory(
  { args: a11yArgs },
  'payload-admin',
  'light'
);
export const PayloadAdminDark = a11yStory(
  { args: a11yArgs },
  'payload-admin',
  'dark'
);
export const SpotlightLight = a11yStory(
  { args: a11yArgs },
  'spotlight',
  'light'
);
export const SpotlightDark = a11yStory({ args: a11yArgs }, 'spotlight', 'dark');
export const CodewareLight = a11yStory({ args: a11yArgs }, 'codeware', 'light');
export const CodewareDark = a11yStory({ args: a11yArgs }, 'codeware', 'dark');
