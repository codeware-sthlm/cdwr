import { describe, expect, it } from 'vitest';

import { formatSource, readFormatError } from './format-source';

const MESSY = `import {useState} from "react"
export default function Box({label}:{label:string}){
const [n,setN]=useState(0)
return <button onClick={()=>setN(n+1)} className="a">{label}:{n}</button>}
`;

describe('formatSource', () => {
  it('formats with the repo options', async () => {
    const result = await formatSource(MESSY);

    expect(result.status).toBe('formatted');
    if (result.status !== 'formatted') {
      return;
    }
    expect(result.text).toContain("import { useState } from 'react';");
    expect(result.text).toContain('const [n, setN] = useState(0);');
    expect(result.text).not.toContain(',\n}');
  });

  it('reports unchanged source as unchanged', async () => {
    const first = await formatSource(MESSY);
    if (first.status !== 'formatted') {
      throw new Error('expected a formatted result');
    }
    expect(await formatSource(first.text)).toEqual({ status: 'unchanged' });
  });

  it('keeps the cursor on the same token', async () => {
    const source = 'const   a=1;\nconst b   =   2;\n';
    const result = await formatSource(source, source.indexOf('b'));

    expect(result.status).toBe('formatted');
    if (result.status !== 'formatted') {
      return;
    }
    expect(
      result.text.slice(result.cursorOffset, result.cursorOffset + 1)
    ).toBe('b');
  });

  it('returns a syntax error with its position instead of throwing', async () => {
    const result = await formatSource('const = ;\n');

    expect(result.status).toBe('error');
    if (result.status !== 'error') {
      return;
    }
    expect(result.message).not.toContain('\n');
    expect(result.line).toBe(1);
  });
});

describe('readFormatError', () => {
  it('drops the trailing position and the code frame', () => {
    const error = Object.assign(new Error('Unexpected token (3:5)\n> 3 | x'), {
      loc: { start: { line: 3, column: 5 } }
    });

    expect(readFormatError(error)).toEqual({
      status: 'error',
      message: 'Unexpected token',
      line: 3,
      column: 5
    });
  });

  it('copes with a thrown non-error', () => {
    expect(readFormatError('boom')).toEqual({
      status: 'error',
      message: 'boom',
      line: null,
      column: null
    });
  });
});
