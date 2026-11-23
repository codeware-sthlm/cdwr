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
  summary: {
    en: 'Downloads with a name, a type and a size.',
    sv: 'Nedladdningar med namn, filtyp och storlek.'
  },
  whenToUse: {
    en: 'For documents the reader should download, such as a brochure, a price list or a specification. Each row shows the file type and size before the download. The files can be picked one by one or listed by tag.',
    sv: 'För dokument som läsaren ska ladda ner, till exempel en broschyr, en prislista eller en specifikation. Varje rad visar filtyp och storlek före nedladdningen. Filerna kan väljas en och en eller listas efter etikett.'
  },
  example: {
    blockType: 'file-area',
    files
  }
};
