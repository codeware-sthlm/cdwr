import path from 'node:path';

import { buildComponent } from './build-component';
import { DEFAULT_HOST_MODULES } from './host-modules';
import type { BuildComponentOptions, BuildComponentResult } from './types';

const root = path.resolve(import.meta.dirname, '../../../../../..');
const themeCss = path.join(
  root,
  'libs/shared/theme/src/lib/_core/site-base.css'
);
const kit = path.join(
  root,
  'libs/app-cms/feature/component-builder/src/test-fixtures/kit.d.ts'
);

const build = (
  source: string,
  overrides: Partial<BuildComponentOptions> = {}
): Promise<BuildComponentResult> =>
  buildComponent({
    tagName: 'acme-counter',
    source,
    themeCss,
    workspaceRoot: root,
    hostModules: { ...DEFAULT_HOST_MODULES, '@site/ui': { typesEntry: kit } },
    ...overrides
  });

const failed = async (
  source: string,
  overrides?: Partial<BuildComponentOptions>
) => {
  const result = await build(source, overrides);
  if (result.ok) {
    throw new Error('expected the build to fail');
  }
  return result.diagnostics;
};

const small = `import { useState } from 'react';
export default function Counter({ label }: { label: string }) {
  const [n, setN] = useState(0);
  return (
    <button className="bg-primary px-3" onClick={() => setN(n + 1)}>
      {label}: {n}
    </button>
  );
}
`;

describe('buildComponent', () => {
  it('builds a small component without bundling React', async () => {
    const result = await build(small);
    if (!result.ok) {
      throw new Error(JSON.stringify(result.diagnostics));
    }
    expect(result.js).toContain('customElements.define("acme-counter"');
    expect(result.js).toContain('__cdwrHost');
    expect(result.js).not.toContain('react.production');
    expect(result.js.length).toBeLessThan(5_000);
    expect(result.css).toContain('.bg-primary');
    expect(result.css).toContain('var(--primary)');
    expect(result.css).toContain('.px-3');
  });

  it('gives identical input an identical hash and changed input another', async () => {
    const a = await build(small);
    const b = await build(small);
    const c = await build(small.replace('px-3', 'px-4'));
    if (!a.ok || !b.ok || !c.ok) {
      throw new Error('expected builds to succeed');
    }
    expect(a.hash).toBe(b.hash);
    expect(a.hash).toMatch(/^[0-9a-f]{16}$/);
    expect(c.hash).not.toBe(a.hash);
  });

  it('reports a type error with its line', async () => {
    const diagnostics = await failed(`export default function C() {
  const n: number = 'x';
  return <p>{n}</p>;
}
`);
    expect(diagnostics).toContainEqual(
      expect.objectContaining({ line: 2, column: 9, severity: 'error' })
    );
  });

  it('requires a default export', async () => {
    const diagnostics = await failed(`export function C() { return <p />; }`);
    expect(diagnostics[0]?.message).toContain('export default');
  });

  it.each(['./other', 'next/image', 'node:fs', '@payloadcms/ui', 'radix-ui'])(
    'rejects an import of %s with its line',
    async (specifier) => {
      const diagnostics = await failed(
        `import React from 'react';\nimport x from '${specifier}';\nexport default () => <p>{String(x)}</p>;\n`
      );
      expect(diagnostics).toEqual([
        expect.objectContaining({
          line: 2,
          severity: 'error',
          message: expect.stringContaining(`"${specifier}"`)
        })
      ]);
    }
  );

  it('rejects dynamic imports of other modules', async () => {
    const diagnostics = await failed(
      `export default () => { import('fs'); return <p />; };`
    );
    expect(diagnostics[0]?.message).toContain('"fs"');
  });

  it.each(['Acme', 'counter', '1-up', 'acme counter', 'font-face'])(
    'rejects the tag name %s',
    async (tagName) => {
      const diagnostics = await failed(small, { tagName });
      expect(diagnostics[0]?.message).toContain(tagName);
    }
  );

  it('bundles an allowed package and tree-shakes it', async () => {
    const result = await build(`import { Check } from 'lucide-react';
export default function C() {
  return <Check className="size-4" />;
}
`);
    if (!result.ok) {
      throw new Error(JSON.stringify(result.diagnostics));
    }
    expect(result.js).toContain('lucide');
    expect(result.js.length).toBeLessThan(20_000);
  });

  it('bundles recharts against the host React', async () => {
    const result = await build(`import { Bar, BarChart } from 'recharts';
export default function C({ data }: { data: { v: number }[] }) {
  return (
    <BarChart width={200} height={100} data={data}>
      <Bar dataKey="v" />
    </BarChart>
  );
}
`);
    if (!result.ok) {
      throw new Error(JSON.stringify(result.diagnostics));
    }
    expect(result.js).not.toContain('react.production');
  });

  it('resolves the host kit through its types entry', async () => {
    const result = await build(`import { Badge } from '@site/ui';
export default () => <Badge>hi</Badge>;
`);
    expect(result.ok).toBe(true);
    const bad = await failed(`import { Badge } from '@site/ui';
export default () => <Badge nope="x">hi</Badge>;
`);
    expect(bad[0]?.line).toBe(2);
  });
});
