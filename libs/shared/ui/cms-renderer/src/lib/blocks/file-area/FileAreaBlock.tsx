import { FileArea } from '@codeware/shared/ui/file-area';
import type { FileAreaBlock as FileAreaBlockProps } from '@codeware/shared/util/payload-types';

import { usePayload } from '../../providers/PayloadProvider';

type Props = FileAreaBlockProps;

export const FileAreaBlock: React.FC<Props> = ({ files: filesFromProps }) => {
  const { locale, payloadUrl } = usePayload();

  const files = (filesFromProps ?? [])
    .map(({ media }) => (media && typeof media === 'object' ? media : null))
    .filter((media) => media !== null)
    .map(
      ({
        createdAt,
        id,
        filenameWithoutPrefix,
        filename,
        filesize,
        mimeType,
        url
      }) => ({
        dateAdded: new Date(createdAt),
        id: String(id),
        name: filenameWithoutPrefix ?? filename ?? '',
        size: Number(filesize),
        mimeType: String(mimeType),
        previewUrl: url?.startsWith('http') ? url : `${payloadUrl}${url}`
      })
    );

  return <FileArea files={files} locale={locale} />;
};
