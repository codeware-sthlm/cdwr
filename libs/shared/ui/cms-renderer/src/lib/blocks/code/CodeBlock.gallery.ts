import type { CodeBlock as CodeBlockProps } from '@codeware/shared/util/payload-types';

import type { BlockGalleryDoc } from '../gallery-doc';

export const codeGallery: BlockGalleryDoc<CodeBlockProps> = {
  summary: {
    en: 'A snippet with syntax highlighting and a language.',
    sv: 'Ett kodavsnitt med syntaxfärgning och ett angivet språk.'
  },
  whenToUse: {
    en: 'When the code is the point and a screenshot of it would not be. It highlights on the server, so the snippet is readable before any JavaScript arrives and stays selectable and copyable.',
    sv: 'När koden är poängen och en skärmbild av den inte hade varit det. Färgningen sker på servern, så avsnittet går att läsa innan någon JavaScript hunnit fram och går fortfarande att markera och kopiera.'
  },
  example: {
    blockType: 'code',
    language: 'ts',
    code: 'const x: string = "hello";'
  }
};
