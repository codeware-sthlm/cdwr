import { AspectRatio } from '@codeware/shared/ui/shadcn/components/aspect-ratio';
import { Badge } from '@codeware/shared/ui/shadcn/components/badge';
import { t } from '@codeware/shared/util/i18n';

import { useFileArea } from '../FileAreaContext';
import type { BaseProps } from '../types';
import { formatFileSize } from '../utils/format-file.size';
import { getFileIcon } from '../utils/get-file-icon';

/** The extension of a file name, or nothing when it has none */
const fileExtension = (name: string): string | undefined => {
  const dot = name.lastIndexOf('.');
  return dot > 0 && dot < name.length - 1 ? name.slice(dot + 1) : undefined;
};

/**
 * File item component for grid view mode.
 */
export const GridViewItem = ({ file }: BaseProps) => {
  const { locale, selectFile } = useFileArea();

  const FileIcon = getFileIcon(file.type);

  return (
    <div
      className="group bg-card hover:border-core-link/40 cursor-pointer overflow-hidden rounded-xl border shadow-xs transition-colors"
      onClick={() => selectFile(file)}
    >
      <AspectRatio ratio={4 / 3}>
        {file.type === 'image' ? (
          <div className="relative h-full w-full overflow-hidden">
            <img
              src={file.previewUrl}
              alt={file.name}
              className="h-full w-full object-cover transition-transform motion-safe:group-hover:scale-105"
            />
          </div>
        ) : (
          <div className="bg-core-link/5 text-core-link flex h-full w-full items-center justify-center">
            <FileIcon className="size-8 stroke-[1.5] transition-transform motion-safe:group-hover:scale-110" />
          </div>
        )}
      </AspectRatio>
      <div className="space-y-1.5 p-3">
        <div
          className="text-foreground truncate text-sm font-medium"
          title={file.name}
        >
          {file.name}
        </div>
        <div className="text-muted-foreground flex items-center justify-between gap-2 text-xs">
          <span>{formatFileSize(file.size)}</span>
          {/* The extension says more than a family name: a CSV and a markdown
              file are both "other" */}
          <Badge
            variant="outline"
            className="font-mono uppercase"
            title={t(locale, file.translationKey)}
          >
            {fileExtension(file.name) ?? t(locale, file.translationKey)}
          </Badge>
        </div>
      </div>
    </div>
  );
};
