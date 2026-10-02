import { describe, expect, it } from 'vitest';

import { type ImportRequest, applyEdit, planImport } from './insert-import';

const insert = (source: string, request: ImportRequest): string => {
  const edit = planImport(source, request);
  return edit ? applyEdit(source, edit) : source;
};

const hook = (name: string): ImportRequest => ({ module: 'react', name });

describe('planImport', () => {
  it('adds a new line after the last import', () => {
    const source = `import { cn } from '@site/ui';\n\nexport default () => null;\n`;

    expect(insert(source, hook('useState'))).toBe(
      `import { cn } from '@site/ui';\nimport { useState } from 'react';\n\nexport default () => null;\n`
    );
  });

  it('adds the line at the top of a source without imports', () => {
    expect(insert('export default () => null;\n', hook('useState'))).toBe(
      `import { useState } from 'react';\n\nexport default () => null;\n`
    );
  });

  it('adds the line to an empty source', () => {
    expect(insert('', hook('useState'))).toBe(
      `import { useState } from 'react';\n`
    );
  });

  it('goes below a use client directive and a leading comment', () => {
    const source = `// A counter\n'use client';\n\nexport default () => null;\n`;

    expect(insert(source, hook('useState'))).toBe(
      `// A counter\n'use client';\n\nimport { useState } from 'react';\n\nexport default () => null;\n`
    );
  });

  it('separates the line from a directive that has no blank line after it', () => {
    expect(insert(`'use client';\nexport default 1;\n`, hook('useId'))).toBe(
      `'use client';\n\nimport { useId } from 'react';\n\nexport default 1;\n`
    );
  });

  it('skips a block comment at the top', () => {
    const source = `/**\n * Header\n */\nexport default 1;\n`;

    expect(insert(source, hook('useId'))).toBe(
      `/**\n * Header\n */\n\nimport { useId } from 'react';\n\nexport default 1;\n`
    );
  });

  it('adds the name to an existing import of the module', () => {
    expect(insert(`import { useState } from 'react';\n`, hook('useMemo'))).toBe(
      `import { useState, useMemo } from 'react';\n`
    );
  });

  it('fills an empty import', () => {
    expect(insert(`import {} from 'react';\n`, hook('useMemo'))).toBe(
      `import { useMemo } from 'react';\n`
    );
  });

  it('does not add a name twice', () => {
    expect(
      planImport(`import { useState } from 'react';`, hook('useState'))
    ).toBe(null);
    expect(
      planImport(`import { useState as s } from 'react';`, hook('useState'))
    ).toBe(null);
  });

  it('keeps a trailing comma', () => {
    expect(
      insert(`import { a, } from 'x';\n`, { module: 'x', name: 'b' })
    ).toBe(`import { a, b, } from 'x';\n`);
  });

  it('extends a multi-line list in its own style', () => {
    const source = `import {\n  Button,\n  Card\n} from '@site/ui';\n`;

    expect(insert(source, { module: '@site/ui', name: 'Badge' })).toBe(
      `import {\n  Button,\n  Card,\n  Badge\n} from '@site/ui';\n`
    );
  });

  it('extends a multi-line list that ends in a comma', () => {
    const source = `import {\n    Button,\n    Card,\n} from '@site/ui';\n`;

    expect(insert(source, { module: '@site/ui', name: 'Badge' })).toBe(
      `import {\n    Button,\n    Card,\n    Badge,\n} from '@site/ui';\n`
    );
  });

  it('adds braces to a default-only import', () => {
    expect(insert(`import React from 'react';\n`, hook('useState'))).toBe(
      `import React, { useState } from 'react';\n`
    );
  });

  it('extends a default and named import', () => {
    expect(
      insert(`import React, { useId } from 'react';\n`, hook('useState'))
    ).toBe(`import React, { useId, useState } from 'react';\n`);
  });

  it('leaves a type import alone and adds a line', () => {
    expect(insert(`import type { FC } from 'react';\n`, hook('useState'))).toBe(
      `import type { FC } from 'react';\nimport { useState } from 'react';\n`
    );
  });

  it('falls back to a new line for a namespace import', () => {
    expect(insert(`import * as React from 'react';\n`, hook('useState'))).toBe(
      `import * as React from 'react';\nimport { useState } from 'react';\n`
    );
  });

  it('falls back to a new line when the braces hold a comment', () => {
    const source = `import { a /* keep */ } from 'x';\n`;

    expect(insert(source, { module: 'x', name: 'b' })).toBe(
      `${source}import { b } from 'x';\n`
    );
  });

  it('matches the quote style of the last import', () => {
    expect(insert(`import { a } from "x";\n`, hook('useId'))).toBe(
      `import { a } from "x";\nimport { useId } from "react";\n`
    );
  });

  it('inserts an empty named import for a package', () => {
    expect(insert('export default 1;\n', { module: 'zod', name: null })).toBe(
      `import {} from 'zod';\n\nexport default 1;\n`
    );
  });

  it('does not repeat an import of a package already imported', () => {
    expect(
      planImport(`import { z } from 'zod';\n`, { module: 'zod', name: null })
    ).toBe(null);
  });

  it('ignores imports of another module', () => {
    expect(
      insert(`import { z } from 'zod';\n`, { module: 'recharts', name: null })
    ).toBe(`import { z } from 'zod';\nimport {} from 'recharts';\n`);
  });

  it('handles a file with no trailing newline', () => {
    expect(insert(`import { a } from 'x';`, hook('useId'))).toBe(
      `import { a } from 'x';\nimport { useId } from 'react';`
    );
  });
});
