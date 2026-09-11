import type {
  FileAreaBlock as FileAreaBlockProps,
  Media
} from '@codeware/shared/util/payload-types';

import type { BlockGalleryDoc } from '../gallery-doc';
import { showcaseFile } from '../gallery-media';

const makeMedia = (
  id: number,
  name: string,
  mimeType: string,
  filesize: number,
  url: string
): Media =>
  ({
    id,
    alt: name,
    filenameWithoutPrefix: name,
    filename: name,
    filesize,
    mimeType,
    url,
    updatedAt: '2024-06-01T00:00:00.000Z',
    createdAt: '2024-06-01T00:00:00.000Z'
  }) as unknown as Media;

// Real files in the showcase bucket: the rows offer a preview and a download,
// and a relative `/uploads/…` url resolved against a site that has no such
// upload, so every one of them answered with a 404
const files: NonNullable<FileAreaBlockProps['files']> = [
  {
    id: '1',
    media: makeMedia(
      1,
      'project-brief.pdf',
      'application/pdf',
      16872,
      showcaseFile('project-brief.pdf')
    )
  },
  {
    id: '2',
    media: makeMedia(
      2,
      'design-tokens.csv',
      'text/csv',
      471,
      showcaseFile('design-tokens.csv')
    )
  },
  {
    id: '3',
    media: makeMedia(
      3,
      'architecture.md',
      'text/markdown',
      594,
      showcaseFile('architecture.md')
    )
  }
];

export const fileAreaGallery: BlockGalleryDoc<FileAreaBlockProps> = {
  name: {
    en: 'Things to take away',
    sv: 'Sådant man tar med sig'
  },
  summary: {
    en: 'Downloads with a name, a type and a size.',
    sv: 'Nedladdningar med namn, filtyp och storlek.'
  },
  whenToUse: {
    en: 'When the page hands over documents rather than describing them — a brief, a price list, a specification. Each row states its type and weight before the reader commits to the download, and the files can be listed one by one or pulled in by tag.',
    sv: 'När sidan lämnar över dokument i stället för att beskriva dem — ett underlag, en prislista, en specifikation. Varje rad anger filtyp och storlek innan läsaren bestämmer sig för att ladda ner, och filerna kan listas en och en eller hämtas via etikett.'
  },
  example: {
    blockType: 'file-area',
    files
  }
};
