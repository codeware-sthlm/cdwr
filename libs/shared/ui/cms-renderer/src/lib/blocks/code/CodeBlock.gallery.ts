import type { CodeBlock as CodeBlockProps } from '@codeware/shared/util/payload-types';

import type { BlockGalleryDoc } from '../gallery-doc';

export const codeGallery: BlockGalleryDoc<CodeBlockProps> = {
  summary: {
    en: 'A snippet with syntax highlighting and a language.',
    sv: 'Ett kodavsnitt med syntaxfärgning och ett angivet språk.'
  },
  whenToUse: {
    en: 'For code the reader should be able to read and copy, such as an example in a guide. The highlighting is done on the server, so the code is readable before the page has loaded its JavaScript, and it can be selected and copied as text.',
    sv: 'För kod som läsaren ska kunna läsa och kopiera, till exempel ett kodexempel i en guide. Färgningen görs på servern, så koden går att läsa innan sidan har laddat sin JavaScript, och den kan markeras och kopieras som text.'
  },
  example: {
    blockType: 'code',
    language: 'ts',
    code: 'const x: string = "hello";'
  }
};
